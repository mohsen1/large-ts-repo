import type { GraphLabWorkspaceState } from '../types';

interface GraphOpsExecutionConsoleProps {
  readonly workspace: GraphLabWorkspaceState;
  readonly onRun: () => void;
}

export const GraphOpsExecutionConsole = ({ workspace, onRun }: GraphOpsExecutionConsoleProps) => {
  const rowsToShow = workspace.rows.map((row, index) => (
    <li
      key={`${row.pluginId}-${index}`}
      style={{
        border: '1px solid #23314a',
        borderRadius: 10,
        padding: '0.5rem',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <div>
        <strong>{row.pluginId}</strong>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>{row.stage}</div>
      </div>
      <span>{row.status}</span>
      <progress value={Math.min(100, row.score)} max={100} />
    </li>
  ));

  return (
    <section style={{ border: '1px solid #2a2e3f', borderRadius: 12, padding: '0.75rem', background: '#0a1220' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
        <h2>Execution console</h2>
        <button type='button' onClick={onRun} disabled={workspace.running}>
          {workspace.running ? 'running...' : 'run'}
        </button>
      </header>
      <ul style={{ display: 'grid', gap: '0.45rem', margin: 0, padding: 0 }}>{rowsToShow}</ul>
    </section>
  );
};
