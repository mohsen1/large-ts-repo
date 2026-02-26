import { memo, useMemo } from 'react';
import type { StressCommandRoute, StressStudioResult } from '../types';

type TimelineBucket = 'pending' | 'active' | 'complete';

interface StressCommandTimelineProps {
  readonly commands: readonly StressCommandRoute[];
  readonly results: readonly StressStudioResult[];
  readonly mode: string;
}

const partition = (commands: readonly StressCommandRoute[]) => {
  const pending: StressCommandRoute[] = [];
  const active: StressCommandRoute[] = [];
  const complete: StressCommandRoute[] = [];

  for (const command of commands) {
    const stage = command.includes('/sim') || command.includes('/simulation')
      ? 'active'
      : command.includes('/verify') || command.includes('/audit')
        ? 'complete'
        : 'pending';

    if (stage === 'active') {
      active.push(command);
      continue;
    }

    if (stage === 'complete') {
      complete.push(command);
      continue;
    }

    pending.push(command);
  }

  return { pending, active, complete } as const;
};

const bucketView = (items: readonly StressCommandRoute[]) =>
  items
    .slice(0, 10)
    .map((route) => ({
      route,
      tail: route.split('/').pop() as string,
    }));

const statusToBucket = (status: StressStudioResult['status']): TimelineBucket => {
  return status === 'applied' ? 'complete' : status === 'queued' ? 'active' : 'pending';
};

const summarize = (results: readonly StressStudioResult[]) => {
  const counters = {
    pending: 0,
    active: 0,
    complete: 0,
  };

  for (const result of results) {
    counters[statusToBucket(result.status)] += 1;
  }

  return counters;
};

export const StressCommandTimeline = ({ commands, results, mode }: StressCommandTimelineProps) => {
  const { pending, active, complete } = useMemo(() => partition(commands), [commands]);
  const bucketCount = useMemo(() => summarize(results), [results]);
  const recentRows = useMemo(
    () =>
      results
        .slice(0, 20)
        .map((result, index) => ({
          key: `${result.route}-${index}`,
          route: result.route,
          accepted: result.accepted,
          status: result.status,
          message: result.message,
        })),
    [results],
  );

  return (
    <section>
      <h3>Command timeline ({mode})</h3>
      <p>
        Pending {pending.length} · Active {active.length} · Complete {complete.length}
      </p>
      <p>
        Pending {bucketCount.pending} · Active {bucketCount.active} · Complete {bucketCount.complete}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <h4>Pending</h4>
          <ul>
            {bucketView(pending).map((entry) => (
              <li key={entry.route}>{entry.route}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Active</h4>
          <ul>
            {bucketView(active).map((entry) => (
              <li key={entry.route}>{entry.route}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Complete</h4>
          <ul>
            {bucketView(complete).map((entry) => (
              <li key={entry.route}>{entry.route}</li>
            ))}
          </ul>
        </div>
      </div>
      <h4>Result rows</h4>
      <ol>
        {recentRows.map((row) => (
          <li key={row.key}>
            <MemoizedRoute route={row.route} /> {row.status} {String(row.accepted)}<br />
            <small>{row.message}</small>
          </li>
        ))}
      </ol>
    </section>
  );
};

const MemoizedRoute = memo(({ route }: { readonly route: StressCommandRoute }) => {
  const suffix = route.split('/').slice(-2).join('.');
  return <code>{suffix}</code>;
});
