import { useMemo, type ReactElement } from 'react';
import { useRecoveryEcosystemWorkspace } from '../hooks/useRecoveryEcosystemWorkspace';

export interface RunCommandPanelProps {
  readonly tenantId: string;
  readonly namespace: string;
}

export const RunCommandPanel = ({ tenantId, namespace }: RunCommandPanelProps): ReactElement => {
  const state = useRecoveryEcosystemWorkspace({ tenantId, namespace });

  const metrics = useMemo(() => {
    const history = state.history.length;
    const errors = state.history.filter((entry) => entry.includes('error')).length;
    return {
      events: state.history.length,
      errors,
      successRate: history > 0 ? Math.round(((history - errors) / history) * 100) : 100,
    };
  }, [state.history]);

  return (
    <section>
      <header>
        <h2>Ecosystem Run Command</h2>
      </header>
      <p>Tenant: {tenantId}</p>
      <p>Namespace: {namespace}</p>
      <p>Workspace snapshots: {state.workspace?.snapshotCount ?? 'loading...'}</p>
      <p>Active runs: {state.workspace?.active ?? 0}</p>
      <p>
        {metrics.successRate}% success ({metrics.events - metrics.errors}/{metrics.events})
      </p>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <div>
        <button type="button" onClick={state.run} disabled={state.running}>
          Start run
        </button>
        <button type="button" onClick={state.dryRun} disabled={state.running}>
          Start dry run
        </button>
        <button type="button" onClick={state.refresh} disabled={state.running}>
          Refresh workspace
        </button>
      </div>
      <RunEventsLog events={state.history} />
    </section>
  );
};

const RunEventsLog = ({ events }: { readonly events: readonly string[] }): ReactElement => {
  const items = [...events].slice(0, 8);
  return (
    <ul>
      {items.length === 0 ? <li>No recent events</li> : items.map((entry) => <li key={entry}>{entry}</li>)}
    </ul>
  );
};
