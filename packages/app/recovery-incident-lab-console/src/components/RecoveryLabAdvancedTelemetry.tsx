import { type ReactElement, useMemo } from 'react';
import type { TimelineSeries } from '@data/recovery-incident-lab-store/temporal-series';
import type { ScenarioExecutionRow } from '@service/recovery-incident-lab-orchestrator';

interface Props {
  readonly series: readonly TimelineSeries[];
  readonly rows: readonly ScenarioExecutionRow[];
}

const summarizeBucket = (series: TimelineSeries) => {
  const buckets = series.buckets.map((bucket) => ({
    from: bucket.from,
    to: bucket.to,
    width: bucket.points.length,
    mean: Number(bucket.mean.toFixed(2)),
  }));

  return {
    totalPoints: series.points.length,
    pointsRange: `${bucketRanges(buckets)}`,
    meanRange: `${buckets[0]?.mean ?? 0}..${buckets[buckets.length - 1]?.mean ?? 0}`,
  };
};

const bucketRanges = (buckets: readonly { from: string; to: string; width: number; mean: number }[]) =>
  buckets.length === 0 ? 'empty' : `${buckets[0].from} → ${buckets[buckets.length - 1].to} (${buckets.length} buckets)`;

export const RecoveryLabAdvancedTelemetry = ({ series, rows }: Props): ReactElement => {
  const summaries = useMemo(
    () => series.map((entry) => summarizeBucket(entry)),
    [series],
  );

  const totals = useMemo(
    () => ({
      points: summaries.reduce((acc, current) => acc + current.totalPoints, 0),
      buckets: series.reduce((acc, entry) => acc + entry.buckets.length, 0),
      rows: rows.length,
      failures: rows.reduce((acc, row) => acc + row.failedPlugins.length, 0),
    }),
    [rows.length, summaries, series],
  );

  return (
    <section className="recovery-lab-advanced-telemetry">
      <h2>Telemetry</h2>
      <dl>
        <dt>Rows</dt>
        <dd>{totals.rows}</dd>
        <dt>Failed plugin refs</dt>
        <dd>{totals.failures}</dd>
        <dt>Series points</dt>
        <dd>{totals.points}</dd>
      </dl>
      <ul>
        {summaries.map((entry, index) => (
          <li key={`${entry.pointsRange}-${index}`}>
            {index}: {entry.pointsRange} mean {entry.meanRange} ({entry.totalPoints})
          </li>
        ))}
      </ul>
    </section>
  );
};
