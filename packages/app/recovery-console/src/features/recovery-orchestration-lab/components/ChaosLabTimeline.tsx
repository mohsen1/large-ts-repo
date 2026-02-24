import { memo } from 'react';

interface TimelineRow {
  readonly plugin: string;
  readonly latency: string;
  readonly parsedMs: number;
}

interface ChaosLabTimelineProps {
  readonly timeline: readonly string[];
  readonly title: string;
  readonly summary: string;
  readonly mode: string;
}

const splitRows = (timeline: readonly string[]) =>
  timeline.map((entry) => {
    const [plugin, latencyRaw] = entry.split('::');
    return {
      plugin,
      latency: latencyRaw ?? '0',
      parsedMs: Number(latencyRaw) || 0,
    } satisfies TimelineRow;
  });

const TotalLatency = ({ rows }: { readonly rows: readonly TimelineRow[] }) => (
  <p>
    total latency: {rows.reduce((acc, row) => acc + row.parsedMs, 0)}ms
  </p>
);

const TopRow = ({ row }: { readonly row: TimelineRow }) => (
  <li>
    {row.plugin}
    {' -> '}
    {row.latency}ms
  </li>
);

export const ChaosLabTimeline = memo(({ timeline, title, summary, mode }: ChaosLabTimelineProps) => {
  const rows = splitRows(timeline);
  const criticalRows = rows.filter((row) => row.parsedMs > 5);
  return (
    <section>
      <h3>{title}</h3>
      <p>{summary}</p>
      <p>mode: {mode}</p>
      <p>steps: {rows.length}</p>
      <TotalLatency rows={rows} />
      <h4>Top latency</h4>
      <ul>
        {criticalRows.map((row) => (
          <TopRow key={`${row.plugin}-${row.latency}`} row={row} />
        ))}
      </ul>
    </section>
  );
});

ChaosLabTimeline.displayName = 'ChaosLabTimeline';
