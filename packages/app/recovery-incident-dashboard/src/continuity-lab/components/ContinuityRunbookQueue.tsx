import { useMemo } from 'react';

export interface ContinuityRunbookQueueProps {
  readonly entries: readonly string[];
}

export const ContinuityRunbookQueue = ({ entries }: ContinuityRunbookQueueProps) => {
  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => left.localeCompare(right)),
    [entries],
  );

  return (
    <section>
      <h3>Pending queue</h3>
      <ul>
        {sortedEntries.map((entry) => (
          <li key={entry}>
            <code>{entry}</code>
          </li>
        ))}
      </ul>
    </section>
  );
};
