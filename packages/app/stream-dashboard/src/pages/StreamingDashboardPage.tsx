import { useCallback, useMemo, useState } from 'react';
import { useStreamDashboard } from '../hooks/useStreamDashboard';
import { StreamHealthCard } from '../components/StreamHealthCard';
import { StreamAlertList } from '../components/StreamAlertList';
import { StreamTopologyPanel } from '../components/StreamTopologyPanel';
import { ThroughputSparkline } from '../components/ThroughputSparkline';
import { StreamSlaSummaryCard } from '../components/StreamSlaSummaryCard';
import { useStreamTopology } from '../hooks/useStreamTopology';
import { useStreamForecast } from '../hooks/useStreamForecast';
import { runDashboardOrchestration } from '../services/streamDashboardService';
import { StreamEventRecord } from '@domain/streaming-observability';

const generateEvents = (streamId: string): StreamEventRecord[] => [
  {
    tenant: 'tenant-main',
    streamId,
    eventType: 'lag-rise',
    latencyMs: 45,
    sampleAt: new Date().toISOString(),
    metadata: { source: 'ui-trigger' },
    severity: 2,
    eventId: `${streamId}-event-lag`,
  },
  {
    tenant: 'tenant-main',
    streamId,
    eventType: 'throughput-shift',
    latencyMs: 22,
    sampleAt: new Date().toISOString(),
    metadata: { source: 'ui-trigger' },
    severity: 1,
    eventId: `${streamId}-event-throughput`,
  },
];

export function StreamingDashboardPage() {
  const tenant = 'tenant-main';
  const streamId = 'stream-core-analytics';
  const topologyState = useStreamTopology(streamId);
  const { state, ingest, summarizeAll, metricSummary } = useStreamDashboard(tenant, streamId);
  const [cleared, setCleared] = useState<string[]>([]);
  const syntheticHistory = useMemo(() => generateEvents(streamId).map((event) => ({
    streamId,
    eventsPerSecond: event.latencyMs,
    bytesPerSecond: 1024,
    inFlight: 3,
    window: { start: Date.now() - 12_000, end: Date.now() },
  })), [streamId]);
  const forecastState = useStreamForecast(streamId, syntheticHistory);

  const onRun = useCallback(async () => {
    await ingest(generateEvents(streamId));
  }, [ingest, streamId]);

  const acknowledge = useCallback((sid: string, signal: { details: string[] }) => {
    setCleared((current) => [...current, `${sid}-${signal.details.join(':')}`]);
  }, []);

  const scaleRequested = useCallback((sid: string, scale: number) => {
    void runDashboardOrchestration(
      { tenant, streamId: sid },
      { streamId: sid, events: generateEvents(sid).map((event) => ({ ...event, severity: Math.min(event.severity + scale, 5) })) },
    );
  }, [tenant]);

  return (
    <main>
      <h1>Streaming Dashboard</h1>
      <p>StreamCount: {state.streamId}</p>
      <button type="button" onClick={onRun}>Run Orchestration</button>
      <div>
        <p>Critical: {metricSummary.criticalCount}</p>
        <p>Warning: {metricSummary.warningCount}</p>
        <p>Healthy: {metricSummary.okCount}</p>
        <p>Plan: {metricSummary.latestPlanState}</p>
      </div>
      <StreamHealthCard streamId={streamId} signals={state.snapshot.signals} onAcknowledge={acknowledge} />
      <StreamAlertList
        signals={state.snapshot.signals.filter((signal) => !cleared.includes(`${signal.streamId}-${signal.details.join(':')}`))}
        onClear={(sid, observedAt) => setCleared((current) => [...current, `${sid}-${observedAt}`])}
      />
        <StreamTopologyPanel
        streamId={streamId}
        nodes={topologyState.nodes}
        edges={topologyState.edges}
        onNodeFocus={(focusedNodeId) => {
          void summarizeAll(generateEvents(streamId).map((event) => ({ streamId, events: [event] })));
          if (focusedNodeId) {
            setCleared((current) => [...current, focusedNodeId]);
          }
        }}
      />
      <ThroughputSparkline streamId={streamId} records={syntheticHistory} />
      {forecastState.forecast ? (
        <StreamSlaSummaryCard streamId={streamId} forecast={forecastState.forecast} onScaleRequest={scaleRequested} />
      ) : null}
    </main>
  );
}
