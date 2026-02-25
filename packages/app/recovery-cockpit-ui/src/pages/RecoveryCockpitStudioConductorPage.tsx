import { useMemo } from 'react';
import { useStudioConductor } from '../hooks/useStudioConductor';
import { StudioCommandDeck } from '../components/studio/StudioCommandDeck';
import { StudioConductorCanvas } from '../components/studio/StudioConductorCanvas';
import { StudioManifestMatrix } from '../components/studio/StudioManifestMatrix';
import { useStudioTimeline } from '../hooks/useStudioTimeline';

const EMPTY_RUN_IDS: readonly string[] = [];

export const RecoveryCockpitStudioConductorPage = () => {
  const {
    tenantId,
    workspaceId,
    manifest,
    pluginIds,
    selectedPluginId,
    runHistory,
    ready,
    running,
    events,
    bootstrap,
    triggerRun,
    selectPlugin,
    clearHistory,
    selectPage,
    page,
  } = useStudioConductor();

  const latestRun = runHistory.at(-1);
  const timeline = useStudioTimeline(latestRun);
  const runSummaries = useMemo(
    () =>
      runHistory.map((run, index) => ({
        index,
        runId: run.runId,
        score: run.result.score,
        count: run.events.length,
        events: run.events.length,
        graph: run.graph,
      })),
    [runHistory],
  );

  const visibleRuns = useMemo(() => runSummaries.slice(page * 5, page * 5 + 5), [page, runSummaries]);

  if (!ready) {
    return (
      <main style={{ padding: 18 }}>
        <header>
          <h2>Recovery cockpit studio</h2>
          <p>Initializing studio conductor...</p>
        </header>
        <button onClick={() => void bootstrap()} type="button">
          Reload
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 18, display: 'grid', gap: 16 }}>
      <header style={{ display: 'grid', gap: 10 }}>
        <h2>Recovery Cockpit Conductor Studio</h2>
        <p>
          Tenant: {tenantId} · Workspace: {workspaceId} · Events: {events}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => void bootstrap()} type="button">
            Re-bootstrap
          </button>
          <button onClick={clearHistory} type="button">
            Clear history
          </button>
          <button
            onClick={() => {
              selectPage(Math.max(0, page - 1));
            }}
            type="button"
          >
            Prev
          </button>
          <button
            onClick={() => {
              selectPage(page + 1);
            }}
            type="button"
          >
            Next
          </button>
        </div>
      </header>

      <section style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <StudioCommandDeck
          pluginIds={pluginIds}
          selectedPlugin={selectedPluginId}
          running={running}
          onRun={(scenario, payload) => triggerRun(scenario, payload)}
          onSelectPlugin={selectPlugin}
        />
        <StudioManifestMatrix manifest={manifest} selectedPlugin={selectedPluginId} onSelectPlugin={selectPlugin} />
        <StudioConductorCanvas pluginIds={pluginIds} run={latestRun} />
      </section>

      <section>
        <h3>Run history</h3>
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>index</th>
              <th>run id</th>
              <th>score</th>
              <th>events</th>
              <th>plugins</th>
            </tr>
          </thead>
          <tbody>
            {visibleRuns.map((entry) => (
              <tr key={entry.runId}>
                <td>{entry.index}</td>
                <td>{entry.runId}</td>
                <td>{entry.score}</td>
                <td>{entry.events}</td>
                <td>{entry.graph.length}</td>
              </tr>
            ))}
            {(visibleRuns.length === 0 ? EMPTY_RUN_IDS : []).map((entry) => (
              <tr key={entry}>
                <td>unused</td>
                <td>unused</td>
                <td>unused</td>
                <td>unused</td>
                <td>unused</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4>Timeline</h4>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 8 }}>
          {JSON.stringify(
            {
              timeline: timeline.nodes,
              hasEvents: timeline.hasEvents,
              byPlugin: timeline.byPlugin,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
};
