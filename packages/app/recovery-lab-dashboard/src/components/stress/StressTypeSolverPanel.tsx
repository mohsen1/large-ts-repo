import { useMemo } from 'react';
import { useStressTypeSolver, type StressTraceRow } from '../../hooks/useStressTypeSolver';

type SolverMode = 'preview' | 'replay' | 'stress';

type SolverPanelProps = {
  readonly mode: SolverMode;
  readonly attempts: number;
};

const formatRow = (row: StressTraceRow, idx: number) => (
  <li key={`${row.route}-${idx}`} style={{ marginBottom: 8, display: 'grid', gap: 2 }}>
    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{row.route}</span>
    <span style={{ color: '#334155' }}>{row.raw}</span>
    <span style={{ color: '#065f46' }}>{row.action}</span>
    <span style={{ color: '#0f172a' }}>depth {row.depth}</span>
  </li>
);

export const StressTypeSolverPanel = ({ mode, attempts }: SolverPanelProps) => {
  const state = useStressTypeSolver({ mode, attempts });

  const buckets = useMemo(() => {
    const accepted = state.traces.filter((trace) => trace.depth > 1);
    const flagged = state.traces.filter((trace) => trace.depth <= 1);
    const grouped = new Map<string, StressTraceRow[]>();
    for (const trace of state.traces) {
      const bucket = grouped.get(trace.action) ?? [];
      bucket.push(trace);
      grouped.set(trace.action, bucket);
    }
    return { accepted, flagged, grouped };
  }, [state.traces]);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Stress Type Solver {mode.toUpperCase()}</h3>
        <span style={{ color: '#0369a1' }}>{state.loading ? 'running' : state.action}</span>
      </header>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={state.controls.start}>
          Start
        </button>
        <button type="button" onClick={state.controls.pause}>
          Pause
        </button>
        <button type="button" onClick={state.controls.abort}>
          Abort
        </button>
      </div>
      {state.error && (
        <p style={{ color: '#b91c1c', fontWeight: 600 }}>{state.error}</p>
      )}
      <p style={{ color: '#0f172a' }}>
        accepted {buckets.accepted.length} flagged {buckets.flagged.length}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <article>
          <h4>Accepted Traces</h4>
          <ul>{state.traces.slice(0, 24).map(formatRow)}</ul>
        </article>
        <article>
          <h4>Action Buckets</h4>
          <ul>
            {Array.from(buckets.grouped.entries()).map(([bucket, items]) => (
              <li key={bucket} style={{ marginBottom: 10 }}>
                <strong>{bucket}</strong> ({items.length})
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
};
