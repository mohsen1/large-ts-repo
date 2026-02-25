import { useMemo, type ReactElement } from 'react';
import type { UseObservabilityState } from '../hooks/useEcosystemObservability';

interface RunEvent {
  readonly at: string;
  readonly event: string;
  readonly stage: string;
  readonly phase: string;
  readonly namespace: string;
  readonly runId: string;
}

const PhaseBadge = ({ phase }: { readonly phase: string }): ReactElement => {
  const className =
    phase === 'running' ? 'phase-running' : phase === 'completed' ? 'phase-completed' : phase === 'aborted' ? 'phase-aborted' : 'phase-queued';

  return <span className={`badge ${className}`}>{phase}</span>;
};

export const RunTimelineInspector = ({
  namespace,
  snapshots,
}: {
  readonly namespace: string;
  readonly snapshots: UseObservabilityState['snapshots'];
}): ReactElement => {
  const events = useMemo(
    () =>
      snapshots
        .flatMap((snapshot) =>
          snapshot.timeline.map((entry) => ({
            ...entry,
            runId: snapshot.runId,
            namespace: snapshot.namespace,
          })),
        )
        .filter((entry) => entry.namespace === namespace)
        .toSorted((left, right) => left.at.localeCompare(right.at)),
    [namespace, snapshots],
  );

  const grouped = useMemo(() => {
    const output = new Map<string, RunEvent[]>();
    for (const event of events) {
      const current = output.get(event.runId) ?? [];
      output.set(event.runId, [...current, event]);
    }
    return [...output.entries()].map(([runId, entries]) => ({ runId, entries }));
  }, [events]);

  return (
    <section>
      <h2>Run timeline inspector</h2>
      {grouped.length === 0 ? <p>No timeline available</p> : null}
      {grouped.map((group) => (
        <article key={group.runId}>
          <h3>{group.runId}</h3>
          <ul>
            {group.entries
              .toSorted((left, right) => left.at.localeCompare(right.at))
              .map((entry) => (
                <li key={`${group.runId}:${entry.at}`}>
                  <time>{entry.at}</time>
                  <strong>{entry.event}</strong>
                  <span>{entry.stage}</span>
                  <PhaseBadge phase={entry.phase} />
                </li>
              ))}
          </ul>
        </article>
      ))}
    </section>
  );
};

export const TimelineSummary = ({
  events,
}: {
  readonly events: ReadonlyArray<{
    readonly at: string;
    readonly event: string;
    readonly runId: string;
    readonly phase: string;
    readonly stage: string;
  }>;
}): ReactElement => {
  const totals = useMemo(() => {
    const matrix = new Map<string, number>();
    for (const event of events) {
      matrix.set(event.phase, (matrix.get(event.phase) ?? 0) + 1);
    }
    return [...matrix.entries()].toSorted((left, right) => right[1] - left[1]);
  }, [events]);

  return (
    <aside>
      <h3>Phase totals</h3>
      <ul>
        {totals.map(([phase, count]) => (
          <li key={phase}>
            {phase}: {count}
          </li>
        ))}
      </ul>
    </aside>
  );
};
