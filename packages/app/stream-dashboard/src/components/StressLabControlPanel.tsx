import { useMemo } from 'react';
import { useStressLabWorkspace } from '../hooks/useStressLabWorkspace';
import { useStressLabPlugins } from '../hooks/useStressLabPlugins';
import { StressLabSignalLedger } from './StressLabSignalLedger';
import { StressLabPluginConsole } from './StressLabPluginConsole';

interface StressLabControlPanelProps {
  readonly tenantId: string;
  readonly runbookCount?: number;
  readonly onRunComplete?: (runId: string) => void;
}

export const StressLabControlPanel = ({ tenantId, runbookCount = 2, onRunComplete }: StressLabControlPanelProps) => {
  const { state, events, run, appendRunbook, removeRunbook, enrichSignals } = useStressLabWorkspace({
    tenantId,
    initialRunbooks: runbookCount,
  });

  const plugins = useStressLabPlugins(tenantId);

  const runLabel = useMemo(() => `${tenantId}-${state.runbookCount}-${state.signalCount}`, [tenantId, state.runbookCount, state.signalCount]);
  const workspaceState = [
    `tenant=${state.workspace.tenantId}`,
    `runbooks=${state.runbookCount}`,
    `signals=${state.signalCount}`,
    `ready=${plugins.ready}`,
  ].join(' | ');

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header>
        <h2>Stress Lab Control Panel</h2>
        <p>{workspaceState}</p>
        <p>{runLabel}</p>
      </header>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void run()}>
          Execute control sequence
        </button>
        <button type="button" onClick={appendRunbook}>
          Add runbook
        </button>
        <button type="button" onClick={() => removeRunbook(state.workspace.runbooks.at(-1)?.id ?? '')}>
          Remove last runbook
        </button>
        <button type="button" onClick={enrichSignals}>
          Inject signal
        </button>
        <button type="button" onClick={plugins.refresh}>
          Reload plugins
        </button>
      </div>

      {state.loading ? <p>Running...</p> : <p>Status: {state.error ?? 'Idle'}</p>}

      <article>
        <h3>Digest</h3>
        <ul>
          <li>Top signal: {state.digestTopSignal.join(', ')}</li>
          <li>Runbooks: {state.runbookCount}</li>
          <li>Signals: {state.signalCount}</li>
          <li>Updated: {state.lastUpdatedAt ?? 'never'}</li>
        </ul>
      </article>

      <StressLabSignalLedger events={events} />
      <StressLabPluginConsole
        ready={plugins.ready}
        stage={plugins.stage}
        summary={plugins.summary}
        summaryCount={plugins.summaryCount}
        entries={plugins.entries}
        loading={plugins.loading}
      />

      <div>
        <h3>Execution result</h3>
        {state.control ? (
          <ul>
            <li>Run Plan: {Boolean(state.control.workspace.plan)}</li>
            <li>Simulated: {Boolean(state.control.workspace.simulation)}</li>
            <li>Confidence: {state.control.workspace.confidence.toFixed(2)}</li>
            <li>Events: {state.control.events.length}</li>
            <li>Events snapshot: {state.control.orchestration.snapshot.stage}</li>
          </ul>
        ) : (
          <p>No run yet</p>
        )}
        <button
          type="button"
          onClick={() => {
            if (state.control?.workspace.plan) {
              onRunComplete?.(`${tenantId}-${state.lastUpdatedAt ?? Date.now()}`);
            }
          }}
          disabled={!state.control?.workspace.plan}
        >
          Open execution plan
        </button>
      </div>
    </section>
  );
};
