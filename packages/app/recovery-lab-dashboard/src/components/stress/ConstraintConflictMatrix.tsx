import { useMemo, useState } from 'react';
import { runOrchestratorMatrix, type SolverArenaResult } from '@domain/recovery-lab-synthetic-orchestration/compiler-orchestrator-grid';
import { type WorkRoute } from '@shared/type-level/stress-conditional-union-grid';
import { type ControlMode } from '@domain/recovery-lab-synthetic-orchestration';

const modeOptions: ControlMode[] = ['idle', 'prime', 'warm', 'execute', 'throttle', 'fallback', 'escalate', 'drain', 'verify', 'finish'];

type Row = {
  readonly route: WorkRoute;
  readonly mode: ControlMode;
  readonly handled: boolean;
  readonly score: number;
  readonly traces: number;
  readonly constraints: number;
};

type MatrixProps = {
  readonly routes: readonly WorkRoute[];
  readonly seedRoute: WorkRoute;
};

export const ConstraintConflictMatrix = ({ routes, seedRoute }: MatrixProps): React.JSX.Element => {
  const [mode, setMode] = useState<ControlMode>('execute');

  const matrix = useMemo(() => {
    const payload = runOrchestratorMatrix(routes.length > 0 ? routes : [seedRoute], mode);
    const rows: Row[] = payload.map((suite, index) => {
        const score = suite.solved.length + suite.matrix.length;
        const route = suite.route;
        return {
          route,
          mode,
          handled: !!suite.constraints[index % suite.constraints.length],
          score,
          traces: suite.solved.length,
          constraints: suite.constraints.length,
        };
      })
      .filter((row): row is Row => typeof row.route === 'string');

    return rows;
  }, [routes, seedRoute, mode]);

  const totals = useMemo(() => {
    const aggregate = matrix.reduce(
      (acc, row) => ({
        totalScore: acc.totalScore + row.score,
        totalTraces: acc.totalTraces + row.traces,
        totalConstraints: acc.totalConstraints + row.constraints,
      }),
      { totalScore: 0, totalTraces: 0, totalConstraints: 0 },
    );
    return {
      totalScore: aggregate.totalScore,
      totalTraces: aggregate.totalTraces,
      totalConstraints: aggregate.totalConstraints,
      averageScore: aggregate.totalScore > 0 ? (aggregate.totalScore / Math.max(matrix.length, 1)).toFixed(2) : '0.00',
      averageTraces: aggregate.totalTraces > 0 ? (aggregate.totalTraces / Math.max(matrix.length, 1)).toFixed(2) : '0.00',
    };
  }, [matrix]);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Constraint Conflict Matrix</h3>
        <select value={mode} onChange={(event) => setMode(event.target.value as ControlMode)}>
          {modeOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </header>

      <div style={{ display: 'grid', gap: 6 }}>
        <p>
          total score: {totals.totalScore} total traces: {totals.totalTraces} total constraints: {totals.totalConstraints}
        </p>
        <p>
          avg score: {totals.averageScore} avg traces: {totals.averageTraces}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
        {matrix.map((entry) => (
          <article
            key={`${entry.route}-${entry.mode}`}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: 8,
              background: entry.handled ? '#ecfeff' : '#f8fafc',
            }}
          >
            <p style={{ fontWeight: 600, margin: 0 }}>{entry.route}</p>
            <p style={{ margin: 0, color: '#334155' }}>
              mode {entry.mode} · score {entry.score} · traces {entry.traces} · constraints {entry.constraints}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
};
