import { memo } from 'react';
import { useMemo } from 'react';
import type { StressLabArenaState } from '../../hooks/useStressLabArena';

interface StressLabSolverArenaProps {
  readonly state: StressLabArenaState;
}

export const StressLabSolverArena = memo(({ state }: StressLabSolverArenaProps) => {
  const statusColor = useMemo(() => {
    if (!state.ready) {
      return 'text-amber-600';
    }
    if (state.matrixWarnings > 2) {
      return 'text-amber-600';
    }
    if (state.matrixSummary > 2000) {
      return 'text-green-600';
    }
    return 'text-blue-600';
  }, [state.matrixSummary, state.matrixWarnings, state.ready]);

  return (
    <section className="stress-lab-solver-arena">
      <h3 className={statusColor}>Solver Arena</h3>
      <dl>
        <dt>Tenant</dt>
        <dd>{state.tenant}</dd>
        <dt>Route count</dt>
        <dd>{state.routeCount}</dd>
        <dt>Route count effective</dt>
        <dd>{state.routeCountEffective}</dd>
        <dt>Matrix summary</dt>
        <dd>{state.matrixSummary}</dd>
        <dt>Warnings</dt>
        <dd>{state.matrixWarnings}</dd>
        <dt>Suite entries</dt>
        <dd>{state.suiteSize}</dd>
      </dl>
      <div className="trace-stream">
        {state.traces.map((trace) => (
          <article key={trace.route} className="trace-stream__item">
            <h4>{trace.route}</h4>
            <p>{trace.command}</p>
            <p>{trace.status}</p>
            <code>{trace.envelope.normalized}</code>
          </article>
        ))}
      </div>
    </section>
  );
});

StressLabSolverArena.displayName = 'StressLabSolverArena';
