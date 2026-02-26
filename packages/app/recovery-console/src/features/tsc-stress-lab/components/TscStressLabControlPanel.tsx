import { useMemo } from 'react';
import { useTscStressLabWorkspace } from '../hooks/useTscStressLabWorkspace';

type TscStressLabControlPanelProps = {
  readonly tenantId: string;
  readonly mode: 'run' | 'audit' | 'build' | 'drill' | 'review' | 'satisfy' | 'observe' | 'synchronize';
};

export const TscStressLabControlPanel = ({ tenantId, mode }: TscStressLabControlPanelProps) => {
  const { state, bootstrap, runPhase, selectRoute, clear, tick, runAll, summary } = useTscStressLabWorkspace(tenantId, mode);

  const canRun = state.status !== 'stopped' && state.routes.length > 0;
  const routeRows = useMemo(
    () => state.routes.map((route, index) => ({ route, label: `${index + 1}: ${route}` })),
    [state.routes],
  );

  const logRows = useMemo(() => state.logs.slice(-20), [state.logs]);

  return (
    <section
      style={{
        display: 'grid',
        gap: '1rem',
        border: '1px solid #2f3450',
        borderRadius: 10,
        padding: '1rem',
        background: '#0e1726',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>TSC Stress Lab Control</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={bootstrap}>
            Bootstrap
          </button>
          <button type="button" onClick={runAll}>
            Run All
          </button>
          <button type="button" onClick={() => tick()}>
            Tick
          </button>
          <button type="button" onClick={clear}>
            Clear
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <section>
          <h3 style={{ margin: 0 }}>Routes</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {routeRows.map((entry, index) => (
              <li key={`${entry.route}:${index}`} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  style={{ width: '100%' }}
                  onClick={() => selectRoute(entry.route, { type: 'run', route: entry.route })}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 style={{ margin: 0 }}>State</h3>
          <p>mode: {mode}</p>
          <p>status: {state.status}</p>
          <p>active phase: {state.activePhase}</p>
          <p>priority: {summary.score}</p>
          <p>
            diagnostics accepted/rejected: {summary.active}/{summary.errors}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.5rem' }}>
            {['phase_01_boot', 'phase_15_repair', 'phase_25_scale', 'phase_50_done'].map((phase) => (
              <button
                key={phase}
                type="button"
                disabled={!canRun}
                onClick={() => runPhase(phase as any)}
              >
                {phase}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div>
        <h3 style={{ margin: 0 }}>Logs</h3>
        <pre
          style={{
            margin: 0,
            maxHeight: 180,
            overflow: 'auto',
            background: '#121c30',
            border: '1px solid #2f3450',
            borderRadius: 8,
            padding: 10,
          }}
        >
          {logRows.join('\n')}
        </pre>
      </div>
    </section>
  );
};
