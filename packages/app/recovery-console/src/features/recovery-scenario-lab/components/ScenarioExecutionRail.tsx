import type { ScenarioLabWorkspace } from '../hooks/useRecoveryScenarioLabWorkspace';

interface ScenarioExecutionRailProps {
  readonly workspace: ScenarioLabWorkspace;
  readonly onRun: () => void;
}

export const ScenarioExecutionRail = ({ workspace, onRun }: ScenarioExecutionRailProps) => {
  const rows = workspace.windows
    .map((window, index) => ({
      id: window.action.id,
      index,
      actionCode: window.action.code,
      requiredApprovals: window.action.requiredApprovals,
      window: `${window.window.earliestAt} → ${window.window.latestAt}`,
      blockerCount: window.blockers.length,
      ready: window.blockers.length === 0,
    }))
    .map((row) => ({
      ...row,
      status: row.ready ? 'ready' : 'blocked',
    }));

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '0.75rem', background: '#020617' }}>
      <h2>Execution rail</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {rows.map((row) => (
          <li
            key={row.id}
            style={{
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '0.5rem',
              display: 'grid',
              gap: '0.25rem',
            }}
          >
            <strong>{row.index + 1}. {row.actionCode}</strong>
            <span>{row.window}</span>
            <span>
              status {row.status} · approvals {row.requiredApprovals} · blockers {row.blockerCount}
            </span>
            <button type="button" onClick={onRun} disabled={!workspace.windowsReady || workspace.running || row.status === 'blocked'}>
              {workspace.running ? 'running...' : 'execute'}
            </button>
          </li>
        ))}
      </ol>
      {rows.length === 0 ? <p>No windows to execute.</p> : null}
    </section>
  );
};
