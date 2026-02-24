import { useMemo, useState } from 'react';
import { useStreamLabTimeline } from '../hooks/useStreamLabTimeline';
import { useStreamLabOrchestrator } from '../hooks/useStreamLabOrchestrator';
import { buildDefaultStreamLabRequest } from '../stress-lab/orchestrator';
import { PolicyEnginePanel } from '../components/stress-lab/PolicyEnginePanel';
import { PluginCatalogPanel } from '../components/stress-lab/PluginCatalogPanel';
import { SessionTimelinePanel } from '../components/stress-lab/SessionTimelinePanel';
import { type StreamLabExecutionReport, type StreamLabRequest } from '../stress-lab/types';

const initialRoute = ['seed', 'normalize'] as const;

export const StreamLabTopologyWorkbenchPage = () => {
  const [tenantId, setTenantId] = useState('tenant-main');
  const [streamId, setStreamId] = useState('stream-topology-lab');
  const [request, setRequest] = useState(buildDefaultStreamLabRequest(tenantId, streamId));
  const { execute, loading, report, analytics, traces, error, reset } = useStreamLabOrchestrator(request);
  const { timeline, summary } = useStreamLabTimeline(report);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const catalog = useMemo(
    () => ['seed-normalizer', 'score-normalizer', 'policy-reco', 'topology-check'] as const,
    [],
  );
  const selectedResult = report?.result ?? null;

  return (
    <main>
      <h1>Topology Workbench</h1>
      <p>Default route: {initialRoute.join(' / ')}</p>
      <div>
        <label>
          Tenant:
          <input
            value={tenantId}
            onChange={(event) => setTenantId(event.currentTarget.value)}
          />
        </label>
        <label>
          Stream:
          <input
            value={streamId}
            onChange={(event) => setStreamId(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setRequest(buildDefaultStreamLabRequest(tenantId || 'tenant-main', streamId || 'stream-topology-lab'));
            void execute();
          }}
          disabled={loading}
        >
          Run Topology Session
        </button>
        <button type="button" onClick={reset}>Clear Workspace</button>
      </div>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <section>
        <h2>Timeline summary</h2>
        <p>Steps: {summary.totalSteps}</p>
        <p>Total elapsed: {summary.totalElapsedMs}ms</p>
        <p>Failed: {summary.failedSteps}</p>
        <p>Last started: {summary.lastStarted}</p>
      </section>

      {analytics ? (
        <section>
          <h2>Analytics</h2>
          <p>Signal count: {analytics.signalCount}</p>
          <p>Plugin count: {analytics.pluginCount}</p>
          <p>Request hash: {analytics.requestHash}</p>
          <ul>
            {Object.entries(analytics.riskBucket).map(([risk, count]) => (
              <li key={risk}>
                {risk}: {count}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PluginCatalogPanel
        catalog={catalog}
        traces={selectedResult?.trace ?? []}
        selected={undefined}
        onSelect={() => null}
      />

      {selectedResult ? (
        <>
          <SessionTimelinePanel traces={selectedResult.trace} timeline={timeline} />
          <PolicyEnginePanel
            result={selectedResult}
            selected={selectedIndex}
            onSelectRunbook={(runbook) => {
              const index = selectedResult?.recommendations.findIndex((entry) => entry.startsWith(runbook));
              setSelectedIndex(Math.max(0, index));
            }}
          />
          <section>
            <h3>Trace log</h3>
            <ol>
              {traces.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </main>
  );
};
