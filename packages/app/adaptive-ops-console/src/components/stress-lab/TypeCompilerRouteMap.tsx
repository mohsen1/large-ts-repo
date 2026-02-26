import { Fragment, useMemo } from 'react';
import type { TraceStep } from '@domain/recovery-lab-synthetic-orchestration';

interface TypeCompilerRouteMapProps {
  readonly steps: readonly TraceStep[];
  readonly tenant: string;
}

export const TypeCompilerRouteMap = ({ steps, tenant }: TypeCompilerRouteMapProps) => {
  const buckets = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const step of steps) {
      const current = grouped.get(step.opcode) ?? 0;
      grouped.set(step.opcode, current + 1);
    }
    return [...grouped.entries()];
  }, [steps]);

  const entries = buckets
    .toSorted((left, right) => right[0].localeCompare(left[0]))
    .map(([opcode, count]) => ({ opcode, count, active: count % 2 === 0 }));

  return (
    <section className="type-compiler-route-map">
      <header>
        <h4>Opcode Map · {tenant}</h4>
      </header>
      {entries.length ? (
        <ul>
          {entries.map(({ opcode, count, active }) => (
            <li key={opcode}>
              <Fragment>
                <span>{opcode}</span>
                <span>{count}</span>
                <span>{active ? 'active' : 'idle'}</span>
              </Fragment>
            </li>
          ))}
        </ul>
      ) : (
        <p>No opcode data.</p>
      )}
    </section>
  );
};
