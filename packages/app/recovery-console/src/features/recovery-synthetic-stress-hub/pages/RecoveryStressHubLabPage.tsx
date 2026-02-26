import { useMemo } from 'react';
import { StressHubTopologyCanvas } from '../components/StressHubTopologyCanvas';
import { useRecoveryStressHubWorkflow } from '../hooks/useRecoveryStressHubWorkflow';

type Metric = {
  readonly id: string;
  readonly mode: string;
  readonly routeCount: number;
  readonly solverWeight: number;
};

const metricClass = (score: number) => {
  if (score >= 20) {
    return 'high';
  }
  if (score >= 10) {
    return 'mid';
  }
  return 'low';
};

export const RecoveryStressHubLabPage = () => {
  const {
    session,
    mode,
    tenant,
    active,
    metrics,
    errors,
    runSession,
    runGrid,
    setMode,
    setTenant,
  } = useRecoveryStressHubWorkflow();

  const rows = useMemo(
    () =>
      session
        ? metrics
            .map((entry) => `${entry.id}:${entry.routeCount}:${entry.solverWeight}`)
            .sort()
            .join('\n')
        : 'No session',
    [session, metrics],
  );

  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        padding: 20,
        color: '#e2e8f0',
        background: 'linear-gradient(140deg,#030712,#0f172a)',
        minHeight: '100vh',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'Azeret Mono, ui-monospace, monospace' }}>Recovery Synthetic Stress Hub</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>
            Run high-cardinality compiler stress scenarios and inspect workflow telemetry.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as 'strict' | 'relaxed' | 'diagnostic' | 'batch' | 'replay')}
            style={{ height: 34 }}
          >
            <option value="strict">strict</option>
            <option value="relaxed">relaxed</option>
            <option value="diagnostic">diagnostic</option>
            <option value="batch">batch</option>
            <option value="replay">replay</option>
          </select>
          <input value={tenant} onChange={setTenant} placeholder="tenant" style={{ height: 34 }} />
          <button disabled={active} onClick={() => void runSession()} type="button">
            run
          </button>
          <button disabled={active} onClick={() => void runGrid()} type="button">
            sweep
          </button>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <StressHubTopologyCanvas rows={6} cols={7} onSelect={() => {}} />
        <aside style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Session metrics</h2>
          {metrics.length === 0 ? (
            <p>No metrics yet.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              {(metrics as readonly Metric[]).map((entry) => (
                <li
                  key={entry.id}
                  style={{
                    borderLeft: `3px solid ${
                      metricClass(entry.solverWeight) === 'high' ? '#14b8a6' : entry.solverWeight >= 10 ? '#f59e0b' : '#60a5fa'
                    }`,
                    paddingLeft: 8,
                  }}
                >
                  <strong>{entry.id}</strong>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{`${entry.mode} · routes:${entry.routeCount}`}</div>
                </li>
              ))}
            </ul>
          )}
          {session ? (
            <div style={{ marginTop: 12, fontSize: 12, color: '#cbd5e1' }}>
              <div>Session: {session.id}</div>
              <div>Mode: {session.mode}</div>
              <div>Started: {session.startedAt}</div>
              <div>Branches: {session.branchOutcomes.length}</div>
            </div>
          ) : null}
        </aside>
      </section>

      <section style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Error/trace stream</h3>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            maxHeight: 220,
            overflow: 'auto',
            fontSize: 11,
            margin: 0,
            border: '1px solid #334155',
            background: '#020617',
            padding: 8,
          }}
        >
          {errors.length > 0 ? errors.join('\n') : rows}
        </pre>
      </section>
    </div>
  );
};
