import { useMemo } from 'react';

export interface TimelineSignal {
  readonly id: string;
  readonly severity: number;
  readonly state: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked';
}

export interface RecoveryOperationsTimelineProps {
  readonly tenant: string;
  readonly signals: readonly TimelineSignal[];
}

const sorted = (signals: readonly TimelineSignal[]): readonly TimelineSignal[] =>
  [...signals].sort((left, right) => {
    const indexLeft = left.id.localeCompare(right.id);
    return indexLeft || right.severity - left.severity;
  });

const stateColor = (state: TimelineSignal['state']): string => {
  if (state === 'succeeded') return 'green';
  if (state === 'failed') return 'red';
  if (state === 'running') return 'blue';
  if (state === 'blocked') return 'orange';
  return 'gray';
};

export const RecoveryOperationsTimeline = ({ tenant, signals }: RecoveryOperationsTimelineProps) => {
  const rows = sorted(signals);

  const totals = useMemo(() => {
    const buckets = {
      succeeded: 0,
      failed: 0,
      running: 0,
      blocked: 0,
      pending: 0,
    };

    for (const signal of signals) {
      buckets[signal.state] += 1;
    }

    return buckets;
  }, [signals]);

  return (
    <section className="operations-timeline">
      <h3>Operations timeline: {tenant}</h3>
      <div>
        {Object.entries(totals).map(([state, count]) => (
          <span key={`${tenant}:${state}`}>
            {state}: {count}{' '}
          </span>
        ))}
      </div>
      <ol>
        {rows.map((signal) => (
          <li key={`${tenant}:${signal.id}`} style={{ color: stateColor(signal.state) }}>
            {signal.id} · {signal.severity.toFixed(2)} · {signal.state}
          </li>
        ))}
      </ol>
    </section>
  );
};
