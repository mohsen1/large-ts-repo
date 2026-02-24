import { useMemo } from 'react';
import type { LatticeSignalEvent } from '@data/recovery-lattice-store';

interface LatticeSignalStreamProps {
  readonly streamId: string;
  readonly events: readonly LatticeSignalEvent[];
  readonly enabled: boolean;
}

interface Group {
  readonly at: string;
  readonly values: readonly LatticeSignalEvent[];
}

export const LatticeSignalStream = ({ streamId, events, enabled }: LatticeSignalStreamProps) => {
  const groups = useMemo<readonly Group[]>(() => {
    const grouped = new Map<string, LatticeSignalEvent[]>();
    for (const event of events) {
      const key = event.at.slice(0, 16);
      const bucket = grouped.get(key) ?? [];
      grouped.set(key, [...bucket, event]);
    }
    return [...grouped.entries()]
      .map(([at, values]) => ({ at, values }))
      .toSorted((left, right) => right.at.localeCompare(left.at));
  }, [events]);

  if (!enabled) {
    return (
      <section>
        <h3>Stream {streamId}</h3>
        <p>Paused</p>
      </section>
    );
  }

  return (
    <section>
      <h3>Stream {streamId}</h3>
      <p>Window count: {groups.length}</p>
      <ul>
        {groups.map((group) => (
          <li key={group.at} style={{ marginBottom: 10 }}>
            <strong>{group.at}</strong>
            <div>
              {group.values.map((event, index) => {
                return (
                  <div
                    key={`${event.level}-${index}`}
                    style={{
                      borderLeft: `4px solid ${event.level === 'critical' ? '#ef4444' : event.level === 'elevated' ? '#f59e0b' : '#10b981'}`,
                      marginTop: 4,
                      paddingLeft: 8,
                    }}
                  >
                    {event.level} / {event.score.toFixed(2)}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
