import { useMemo } from 'react';
import { StreamEventRecord } from '@domain/streaming-observability';

interface StreamingPolicyPanelProps {
  readonly streamId: string;
  readonly policyScale: number;
  readonly warnings: readonly string[];
  readonly actions: readonly string[];
  readonly mode: 'adaptive' | 'conservative' | 'strict';
  readonly onRefresh: () => void;
}

interface EventDensityState {
  readonly low: number;
  readonly mid: number;
  readonly high: number;
}

const sampleEvents: readonly StreamEventRecord[] = [
  {
    tenant: 'tenant-main',
    streamId: 'stream-core-analytics',
    eventType: 'throughput-shift',
    latencyMs: 12,
    sampleAt: new Date().toISOString(),
    metadata: {},
    severity: 2,
    eventId: 'seed-event-throughput',
  },
];

export const StreamingPolicyPanel = ({
  streamId,
  policyScale,
  warnings,
  actions,
  mode,
  onRefresh,
}: StreamingPolicyPanelProps) => {
  const density = useMemo<EventDensityState>(() => {
    const low = sampleEvents.filter((event) => event.severity <= 2).length;
    const mid = sampleEvents.filter((event) => event.severity === 3).length;
    const high = sampleEvents.filter((event) => event.severity >= 4).length;
    return { low, mid, high };
  }, []);

  const policyState = policyScale > 4 ? 'scale-up' : policyScale > 1 ? 'watch' : 'idle';
  return (
    <section>
      <h2>Streaming Policy Engine</h2>
      <p>Stream: {streamId}</p>
      <p>Mode: {mode}</p>
      <p>Policy scale: {policyScale}</p>
      <p>State: {policyState}</p>
      <div>
        <strong>Density</strong>
        <ul>
          <li>Low severity events: {density.low}</li>
          <li>Mid severity events: {density.mid}</li>
          <li>High severity events: {density.high}</li>
        </ul>
      </div>
      <div>
        <strong>Actions</strong>
        <ul>
          {actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Warnings</strong>
        <ul>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onRefresh}>Refresh policy</button>
    </section>
  );
};
