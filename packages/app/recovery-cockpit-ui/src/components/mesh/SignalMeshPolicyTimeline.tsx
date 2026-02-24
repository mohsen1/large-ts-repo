import { memo, useMemo } from 'react';
import type { MeshControlExecutionResult } from '../../services/meshControlPlaneScenarioService';

export interface SignalMeshPolicyTimelineProps {
  readonly run: MeshControlExecutionResult;
  readonly maxColumns?: number;
  readonly onCellSelect?: (bucket: string) => void;
}

type PolicyBucket = {
  readonly bucket: string;
  readonly value: number;
};

const toPolicyBuckets = (run: MeshControlExecutionResult): readonly PolicyBucket[] => {
  const values = new Map<string, number>();
  for (const trace of run.traces) {
    const [metric = 'global', tail = ''] = trace.split(':');
    const score = Number(tail) || metric.length / 10;
    values.set(metric, (values.get(metric) ?? 0) + score);
  }
  return [...values.entries()].map(([bucket, value]) => ({ bucket, value }));
};

const normalizeBuckets = (buckets: readonly PolicyBucket[]): readonly PolicyBucket[] =>
  buckets.toSorted((left, right) => right.value - left.value);

export const toRuntimeStatus = (result: MeshControlExecutionResult): 'running' | 'complete' | 'failed' => {
  if (result.score >= 1) {
    return 'complete';
  }
  if (!result.ok) {
    return 'failed';
  }
  return 'running';
};

const percentile = (values: readonly number[], ratio: number): number => {
  const normalized = values.toSorted((left, right) => left - right);
  const safeRatio = Math.min(0.99, Math.max(0, ratio));
  const point = Math.floor(safeRatio * (normalized.length - 1));
  return normalized[point] ?? 0;
};

const buildGrid = (values: readonly PolicyBucket[], maxColumns: number): readonly PolicyBucket[][] => {
  const rows: PolicyBucket[][] = [];
  const normalized = normalizeBuckets(values);
  for (let row = 0; row < maxColumns; row += 1) {
    rows.push(normalized.slice(row * maxColumns, row * maxColumns + maxColumns));
  }
  return rows;
};

const buildLabel = (bucket: PolicyBucket): string =>
  `${bucket.bucket.toUpperCase()}:${bucket.value.toFixed(2)}`;

export const SignalMeshPolicyTimeline = memo<SignalMeshPolicyTimelineProps>(({
  run,
  maxColumns = 4,
  onCellSelect,
}) => {
  const buckets = useMemo(() => toPolicyBuckets(run), [run]);
  const scores = useMemo(() => buckets.map((bucket) => bucket.value), [buckets]);
  const summary = useMemo(() => [
    percentile(scores, 0.5),
    percentile(scores, 0.9),
    percentile(scores, 0.99),
  ], [scores]);

  const rows = useMemo(() => buildGrid(buckets, Math.max(1, maxColumns)), [buckets, maxColumns]);

  return (
    <section className="mesh-policy-timeline">
      <h4>{run.runId}</h4>
      <p>policy buckets: {summary.map((entry) => entry.toFixed(4)).join(', ')}</p>
      <div className="mesh-policy-timeline__grid">
        {rows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="mesh-policy-timeline__row">
            {row.map((bucket) => (
              <button
                key={`${run.runId}:${bucket.bucket}`}
                type="button"
                className="mesh-policy-timeline__cell"
                onClick={() => onCellSelect?.(bucket.bucket)}
              >
                {buildLabel(bucket)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
});
