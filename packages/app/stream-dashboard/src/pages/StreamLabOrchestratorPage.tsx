import { useMemo, useState } from 'react';
import { useStreamLabOrchestrator } from '../hooks/useStreamLabOrchestrator';
import { useStreamLabTimeline } from '../hooks/useStreamLabTimeline';
import { buildDefaultStreamLabRequest } from '../stress-lab/orchestrator';
import { PluginCatalogPanel } from '../components/stress-lab/PluginCatalogPanel';
import { PolicyEnginePanel } from '../components/stress-lab/PolicyEnginePanel';
import { SessionTimelinePanel } from '../components/stress-lab/SessionTimelinePanel';
import { TopologyHeatmapPanel } from '../components/stress-lab/TopologyHeatmapPanel';
import { type StreamLabExecutionReport, type StreamLabExecutionTrace } from '../stress-lab/types';

type PluginOrderChoice = 'ingest-plugin' | 'policy-plugin' | 'topology-plugin';

type PluginChoice = readonly PluginOrderChoice[];

const getCatalogFromReport = (report: StreamLabExecutionReport | null): readonly string[] => {
  if (!report) {
    return ['seed-normalizer', 'score-normalizer', 'policy-reco'];
  }

  const recRunbooks = report.chainOutput.recommendations.map((entry) => entry.runbook);
  const merged = [...new Set(['seed-normalizer', 'score-normalizer', 'policy-reco', ...recRunbooks])];
  return merged;
};

const coerceOrderFromValue = (value: string): PluginChoice => {
  const choices = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is PluginOrderChoice =>
      entry === 'ingest-plugin' || entry === 'policy-plugin' || entry === 'topology-plugin',
    );

  if (choices.length === 0) {
    return ['ingest-plugin'];
  }
  return choices;
};

export const StreamLabOrchestratorPage = () => {
  const [selectedPlugin, setSelectedPlugin] = useState('seed-normalizer');
  const [selectedRunbookIndex, setSelectedRunbookIndex] = useState(0);
  const [request, setRequest] = useState(buildDefaultStreamLabRequest('tenant-main', 'stream-core'));
  const { loading, report, execute, traces, error, analytics, reset } = useStreamLabOrchestrator(request);
  const { timeline, summary } = useStreamLabTimeline(report);

  const catalog = useMemo(() => getCatalogFromReport(report), [report]);
  const selectedResult = report?.result ?? null;

  const pluginOption = coerceOrderFromValue(request.options.pluginOrder.join(','));

  return (
    <main>
      <h1>Stream Lab Orchestrator</h1>
      <p>Tenant: {request.tenantId}</p>
      <p>Stream: {request.streamId}</p>
      <p>
        Total elapsed: {summary.totalElapsedMs}ms · Failed stages: {summary.failedSteps}
      </p>
      <p>Topology events: {selectedResult?.trace.length ?? 0}</p>
      {error ? <p style={{ color: 'darkred' }}>Error: {error}</p> : null}

      <label>
        Select plugin:
        <select
          value={selectedPlugin}
          onChange={(event) => setSelectedPlugin(event.currentTarget.value)}
        >
          {catalog.map((name) => (
            <option value={name} key={name}>{name}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Plugin order: </span>
        <select
          value={request.options.pluginOrder.join(',')}
          onChange={(event) => {
            const nextOrder = coerceOrderFromValue(event.currentTarget.value);
            setRequest((current) => ({
              ...current,
              options: { ...current.options, pluginOrder: nextOrder },
            }));
          }}
        >
          <option value="ingest-plugin">ingest-plugin</option>
          <option value="policy-plugin,topology-plugin">policy-plugin,topology-plugin</option>
          <option value="topology-plugin">topology-plugin</option>
        </select>
      </label>

      <div>
        <button type="button" onClick={() => void execute(request)} disabled={loading}>
          Run Orchestration
        </button>
        <button type="button" onClick={reset}>Reset</button>
      </div>

      <PluginCatalogPanel
        catalog={catalog}
        traces={selectedResult?.trace ?? []}
        selected={selectedPlugin}
        onSelect={setSelectedPlugin}
      />

      {analytics ? (
        <section>
          <h2>Analytics Snapshot</h2>
          <p>Signals: {analytics.signalCount}</p>
          <p>Plugins: {analytics.pluginCount}</p>
          <p>Warning score: {analytics.warningScore}</p>
          <p>Risk: {analytics.requestHash}</p>
          <ul>
            {Object.entries(analytics.riskBucket).map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SessionTimelinePanel traces={selectedResult?.trace ?? []} timeline={timeline} />

      {selectedResult ? (
        <>
          <PolicyEnginePanel
            result={selectedResult}
            selected={selectedRunbookIndex}
            onSelectRunbook={(runbook) => {
              const index = selectedResult.recommendations.findIndex((entry) => entry.startsWith(runbook));
              setSelectedRunbookIndex(index >= 0 ? index : 0);
            }}
          />
          <TopologyHeatmapPanel
            result={selectedResult}
            onCellSelect={(cell) => {
              const next = Math.min(selectedResult.recommendations.length - 1, cell.row + cell.col);
              setSelectedRunbookIndex(next);
            }}
          />
        </>
      ) : null}

      <section>
        <h2>Run Trace</h2>
        <ul>
          {traces.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>
      </section>
      <p>Requested: {summary.totalSteps} steps</p>
      <p>Last started: {summary.lastStarted ?? 'n/a'}</p>
      <p>Active order: {pluginOption.join(' → ')}</p>
    </main>
  );
};
