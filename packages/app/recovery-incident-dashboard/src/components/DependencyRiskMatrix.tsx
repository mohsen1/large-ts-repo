import { type ChangeEvent, useMemo } from 'react';
import type { DashboardSignal } from '@service/recovery-workload-orchestrator';

export interface DependencyRiskMatrixProps {
  readonly signal: DashboardSignal;
  readonly selectedBucket: string;
  readonly onBucketChange: (bucket: string) => void;
}

const bucketAsNumber = (bucket: string): number => Number.parseInt(bucket.replace(/\D+/g, ''), 10) || 0;

export const DependencyRiskMatrix = ({ signal, selectedBucket, onBucketChange }: DependencyRiskMatrixProps) => {
  const points = useMemo(
    () =>
      signal.trend.map((entry) => ({
        ...entry,
        heat: Math.min(10, Math.max(1, entry.value)),
        bucketValue: bucketAsNumber(entry.bucket),
      })),
    [signal.trend],
  );

  const options = useMemo(() => {
    const values = new Set(signal.trend.map((entry) => entry.bucket));
    return [...values].sort().map((bucket) => ({
      value: bucket,
      label: `Window ${bucket}`,
    }));
  }, [signal.trend]);

  const selected = points.find((entry) => entry.bucket === selectedBucket)?.bucket ?? options[0]?.value;

  return (
    <section className="dependency-risk-matrix">
      <header>
        <h2>Dependency Risk Matrix</h2>
      </header>

      <label>
        Time Bucket
        <select value={selected ?? '0'} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          onBucketChange(event.target.value);
        }}>
          {options.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      <div className="risk-heatmap">
        {points.map((entry) => {
          const isActive = entry.bucket === selected;
          const intensity = entry.heat;
          return (
            <div
              key={entry.bucket}
              className={`risk-cell ${isActive ? 'active' : ''}`}
              style={{ opacity: Math.max(0.1, intensity / 10) }}
            >
              <span>{entry.bucketValue}</span>
              <small>{entry.value.toFixed(1)}</small>
            </div>
          );
        })}
      </div>

      <p>
        Active trend values: {points.filter((entry) => entry.bucket === selected).map((entry) =>
          `${entry.bucketValue}:${entry.value.toFixed(2)}`).join(', ')}
      </p>
    </section>
  );
};
