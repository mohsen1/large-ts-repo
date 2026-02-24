import { memo, useMemo } from 'react';

interface SignalEntry {
  readonly id: string;
  readonly value: string;
}

interface SignalTapeProps {
  readonly events: readonly string[];
  readonly lane: string;
  readonly enabled: boolean;
}

export const SignalTape = memo(({ events, lane, enabled }: SignalTapeProps) => {
  const signalRows = useMemo<readonly SignalEntry[]>(
    () =>
      events
        .map((value, index) => ({
          id: `${lane}-${index}`,
          value,
        }))
        .toSorted((left, right) => right.id.localeCompare(left.id)),
    [events, lane],
  );

  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12 }}>
      <h3>{lane}</h3>
      <p>{enabled ? 'streaming' : 'paused'}</p>
      <ol>
        {signalRows.map((entry) => (
          <li key={entry.id}>{entry.value}</li>
        ))}
      </ol>
    </section>
  );
});

SignalTape.displayName = 'SignalTape';
