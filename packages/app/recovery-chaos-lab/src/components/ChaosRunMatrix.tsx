import { useDeferredValue, useMemo } from 'react';
import type { ChaosRunEvent } from '@service/recovery-chaos-orchestrator';

export interface ChaosRunMatrixProps {
  readonly events: readonly ChaosRunEvent[];
  readonly onSelect?: (event: ChaosRunEvent) => void;
}

type EventCluster = {
  readonly runId: string;
  readonly events: readonly ChaosRunEvent[];
};

export function ChaosRunMatrix({ events, onSelect }: ChaosRunMatrixProps) {
  const deferredEvents = useDeferredValue(events);
  const grouped = useMemo(() => {
    const grouped = new Map<string, ChaosRunEvent[]>();
    for (const event of deferredEvents) {
      const bucket = grouped.get(event.runId);
      if (bucket) {
        bucket.push(event);
      } else {
        grouped.set(event.runId, [event]);
      }
    }
    const groups = [...grouped.entries()].map<EventCluster>(([runId, records]) => ({
      runId,
      events: records
    }));
    return groups;
  }, [deferredEvents]);

  const ordered = useMemo(() => {
    return grouped
      .toSorted((lhs, rhs) => rhs.events.length - lhs.events.length)
      .map((group) => ({
        ...group,
        density: group.events.length / Math.max(1, new Set(group.events.map((event) => event.kind)).size)
      }));
  }, [grouped]);

  return (
    <section className="chaos-run-matrix">
      <header>
        <h3>Run matrix</h3>
      </header>
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Events</th>
            <th>Density</th>
            <th>First</th>
            <th>Last</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((group) => {
            const first = group.events[0];
            const last = group.events.at(-1);
            const started = first?.at ?? 0;
            const ended = last?.at ?? 0;
            return (
              <tr key={group.runId}>
                <td>{group.runId}</td>
                <td>{group.events.length}</td>
                <td>{group.density.toFixed(2)}</td>
                <td>{new Date(Number(started)).toLocaleTimeString()}</td>
                <td>{new Date(Number(ended)).toLocaleTimeString()}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => onSelect?.(first as ChaosRunEvent)}
                  >
                    focus
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
