import { useMemo } from 'react';
import { AutonomyScope } from '@domain/recovery-autonomy-graph';
import { useAutonomyOverview } from '../hooks/useAutonomyOverview';

interface AutonomySignalBoardProps {
  readonly tenantId: string;
  readonly graphId: string;
  readonly scope?: AutonomyScope;
}

export const AutonomySignalBoard = ({ tenantId, graphId, scope }: AutonomySignalBoardProps) => {
  const overview = useAutonomyOverview(tenantId, graphId, scope);

  const summary = useMemo(() => {
    const grouped = overview.signals.reduce<Record<string, number>>((acc, signal) => {
      acc[signal.scope] = (acc[signal.scope] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(grouped)
      .sort((left, right) => right[1] - left[1])
      .map(([scope, count]) => `${scope}: ${count}`)
      .join(' | ');
  }, [overview.signals]);

  const totals = useMemo(
    () =>
      overview.signals.reduce(
        (acc, signal) => ({
          [signal.scope]: (acc[signal.scope] ?? 0) + 1,
        }),
        {} as Record<string, number>,
      ),
    [overview.signals],
  );

  const topScope = useMemo(
    () =>
      Object.entries(totals)
        .map(([scope, count]) => ({ scope, count }))
        .sort((left, right) => right.count - left.count)[0]?.scope,
    [totals],
  );

  return (
    <section>
      <h3>Signal Board</h3>
      <p>{overview.loading ? 'Loading…' : summary || 'No signals yet'}</p>
      <p>{topScope ? `Top scope: ${topScope}` : 'Top scope: none'}</p>
      <ol>
        {overview.signals.slice(0, 8).map((entry) => (
          <li key={entry.signalId}>
            <strong>{entry.scope}</strong> · {entry.signalType} · {entry.severity} · {entry.score}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => void overview.hydrate()}>
        Refresh
      </button>
    </section>
  );
};
