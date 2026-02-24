import { useMemo } from 'react';
import { SignalClass, useTimelineSignalCadence } from '../hooks/useTimelineSignalCadence';

interface TimelineSignalHeatmapProps {
  readonly timelineName: string;
  readonly cadence: ReturnType<typeof useTimelineSignalCadence>['cadence'];
}

type HeatBucket = Record<SignalClass, number>;

const defaultBucket = (value: number) => ({
  availability: value,
  integrity: value,
  performance: value,
  compliance: value,
});

const asPercent = (value: number, max: number) =>
  max === 0 ? '0.0' : ((value / max) * 100).toFixed(1);

const heatClass = (count: number): string =>
  count > 24 ? 'critical' : count > 12 ? 'high' : count > 6 ? 'mid' : 'low';

const bucketize = (cadence: TimelineSignalHeatmapProps['cadence'][number]['summary']): HeatBucket =>
  Object.entries(cadence).reduce<HeatBucket>((acc, [signalClass, value]) => {
    const bucket = acc[signalClass as SignalClass] ?? 0;
    const next = Math.max(bucket, value.count);
    return {
      ...acc,
      [signalClass as SignalClass]: next,
    };
  }, defaultBucket(0));

export function TimelineSignalHeatmap({ timelineName, cadence }: TimelineSignalHeatmapProps) {
  const buckets = useMemo(
    () =>
      cadence.map((entry) => ({
        timelineId: entry.timelineId,
        timelineName: entry.timelineName,
        bucket: bucketize(entry.summary),
      })),
    [cadence],
  );
  const maxValue = useMemo(() => {
    return Math.max(
      0,
      ...buckets.flatMap((bucket) => [
        bucket.bucket.availability,
        bucket.bucket.integrity,
        bucket.bucket.performance,
        bucket.bucket.compliance,
      ]),
    );
  }, [buckets]);

  return (
    <section>
      <h3>Signal Heatmap: {timelineName}</h3>
      <table>
        <thead>
          <tr>
            <th>Timeline</th>
            <th>availability</th>
            <th>integrity</th>
            <th>performance</th>
            <th>compliance</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((row) => (
            <tr key={row.timelineId}>
              <td>{row.timelineName}</td>
              <td className={heatClass(row.bucket.availability)}>
                <span
                  aria-label={`availability ${row.bucket.availability}`}
                  style={{ width: `${asPercent(row.bucket.availability, maxValue)}%` }}
                >
                  {row.bucket.availability}
                </span>
              </td>
              <td className={heatClass(row.bucket.integrity)}>
                <span
                  aria-label={`integrity ${row.bucket.integrity}`}
                  style={{ width: `${asPercent(row.bucket.integrity, maxValue)}%` }}
                >
                  {row.bucket.integrity}
                </span>
              </td>
              <td className={heatClass(row.bucket.performance)}>
                <span
                  aria-label={`performance ${row.bucket.performance}`}
                  style={{ width: `${asPercent(row.bucket.performance, maxValue)}%` }}
                >
                  {row.bucket.performance}
                </span>
              </td>
              <td className={heatClass(row.bucket.compliance)}>
                <span
                  aria-label={`compliance ${row.bucket.compliance}`}
                  style={{ width: `${asPercent(row.bucket.compliance, maxValue)}%` }}
                >
                  {row.bucket.compliance}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
