import type { ReactElement } from 'react';
import type { HorizonBucket } from '@domain/recovery-operations-models/readiness-horizon';

interface ReadinessHorizonChartProps {
  readonly buckets: readonly HorizonBucket[];
}

interface BucketRow {
  readonly start: string;
  readonly end: string;
  readonly score: number;
  readonly pressure: number;
  readonly risk: string;
  readonly vectors: string;
}

export const ReadinessHorizonChart = ({ buckets }: ReadinessHorizonChartProps): ReactElement => {
  const rows: BucketRow[] = buckets.map((bucket) => {
    const pressure = bucket.points.reduce((acc, point) => acc + point.pressure, 0);
    const total = bucket.points.length;
    const averageScore = bucket.points.reduce((acc, point) => acc + point.value, 0);
    return {
      start: bucket.bucketStart,
      end: bucket.bucketEnd,
      score: Number((averageScore / Math.max(1, total)).toFixed(2)),
      pressure: Number((pressure / Math.max(1, total)).toFixed(2)),
      risk: bucket.dominantProjection,
      vectors: bucket.atRiskVectors.join(', '),
    };
  });

  return (
    <section className="readiness-horizon-chart">
      <h3>Readiness horizon</h3>
      {rows.length === 0 ? <p>No readiness buckets</p> : null}
      <table>
        <thead>
          <tr>
            <th>Start</th>
            <th>End</th>
            <th>Score</th>
            <th>Pressure</th>
            <th>Risk</th>
            <th>Vectors</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.start}-${row.end}`}>
              <td>{row.start}</td>
              <td>{row.end}</td>
              <td>{row.score}</td>
              <td>{row.pressure}</td>
              <td>{row.risk}</td>
              <td>{row.vectors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
