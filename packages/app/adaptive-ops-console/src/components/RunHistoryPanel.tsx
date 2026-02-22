import { AdaptiveOpsDashboardState } from '../hooks/useAdaptiveOpsDashboard';

interface RunHistoryPanelProps {
  state: AdaptiveOpsDashboardState;
}

export const RunHistoryPanel = ({ state }: RunHistoryPanelProps) => {
  return (
    <section className="run-history-panel">
      <h2>Execution History</h2>
      <div>
        <p>Tenant: {state.summaries.at(-1)?.tenantId ?? 'none'}</p>
        <p>Running: {state.running ? 'yes' : 'no'}</p>
      </div>
      <ul>
        {state.summaries.map((summary) => (
          <li key={summary.runId ?? `${summary.tenantId}-${summary.policyNames[0] ?? 'unknown'}`}>
            <code>{summary.runId ?? 'no-run-id'}</code>
            <strong>{summary.tenantId}</strong>
            <em>{summary.status}</em>
            <small>conflicts={summary.conflictCount}</small>
          </li>
        ))}
      </ul>
      {state.errors.length > 0 && (
        <ul className="error-list">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </section>
  );
};
