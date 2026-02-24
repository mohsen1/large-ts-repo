import { memo } from 'react';

interface ChaosLabSignalDeckProps {
  readonly tenant: string;
  readonly timeline: readonly string[];
  readonly directiveCount: number;
  readonly summary: string;
}

const parseEntry = (entry: string) => {
  const [scope, count] = entry.split('::');
  return {
    scope: scope ?? '',
    count: Number(count ?? '0'),
    key: `${scope ?? 'unknown'}-${count ?? '0'}`,
  };
};

const SortableList = ({ rows }: { readonly rows: readonly { readonly scope: string; readonly count: number; readonly key: string }[] }) => {
  return (
    <ul>
      {rows
        .slice()
        .sort((left, right) => right.count - left.count)
        .map((entry) => (
          <li key={entry.key}>
            {entry.scope} ({entry.count})
          </li>
        ))}
    </ul>
  );
};

export const ChaosLabSignalDeck = memo(({ tenant, timeline, directiveCount, summary }: ChaosLabSignalDeckProps) => {
  const rows = timeline.map(parseEntry);
  const totalSignals = rows.reduce((acc, row) => acc + row.count, 0);
  const directiveCoverage = directiveCount > 0 ? Number(((directiveCount / Math.max(1, timeline.length)) * 100).toFixed(2)) : 0;

  return (
    <section>
      <h3>Tenant Signal Deck</h3>
      <p>tenant: {tenant}</p>
      <p>active directives: {directiveCount}</p>
      <p>signal count: {Number.isFinite(totalSignals) ? totalSignals : 0}</p>
      <p>directive coverage: {directiveCoverage}%</p>
      <p>summary: {summary}</p>
      <SortableList rows={rows} />
    </section>
  );
});

ChaosLabSignalDeck.displayName = 'ChaosLabSignalDeck';
