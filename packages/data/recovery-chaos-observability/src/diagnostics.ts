import type { StageBoundary } from '@domain/recovery-chaos-lab';
import type { ChaosRunEnvelope, ChaosRunMetrics, QueryCursor } from './models';

interface RunByNamespace<T extends string> {
  readonly key: T;
  readonly rows: readonly ChaosRunEnvelope<readonly StageBoundary<string, unknown, unknown>[]>[];
}

export interface AggregateMetric {
  readonly runCount: number;
  readonly completeRate: number;
  readonly avgProgress: number;
  readonly statusBuckets: Record<string, number>;
  readonly sampleWindow: string;
}

export interface BucketReport {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly totals: AggregateMetric;
  readonly latestRunId: string | undefined;
  readonly capturedAt: number;
}

export interface StageHealth {
  readonly stage: string;
  readonly runs: number;
  readonly failures: number;
  readonly p95Progress: number;
}

export type Severity = 'critical' | 'warning' | 'normal';
export type TrendDirection = 'improving' | 'flat' | 'degrading';

export interface Trend {
  readonly severity: Severity;
  readonly direction: TrendDirection;
  readonly delta: number;
}

function percentile(values: readonly number[], ratio: number): number {
  if (!values.length) return 0;
  const normalized = [...values].sort((lhs, rhs) => lhs - rhs);
  const maxIndex = normalized.length - 1;
  return normalized[Math.floor(ratio * maxIndex)] ?? 0;
}

function aggregateStatusRows(rows: readonly ChaosRunEnvelope<readonly StageBoundary<string, unknown, unknown>[]>[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const row of rows) {
    output[row.status] = (output[row.status] ?? 0) + 1;
  }
  return output;
}

function collectMetricValue(metrics: ChaosRunMetrics, key: string): number | undefined {
  const direct = metrics.samples.find((sample) => String(sample.metric) === key);
  if (direct) {
    return typeof direct.value === 'number' ? direct.value : undefined;
  }
  return undefined;
}

export function summarizeRuns<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<T>[]
): AggregateMetric {
  if (!rows.length) {
    return {
      runCount: 0,
      completeRate: 0,
      avgProgress: 0,
      statusBuckets: {},
      sampleWindow: '0/0'
    };
  }

  const complete = rows.filter((row) => row.status === 'complete').length;
  const completeRate = complete / rows.length;
  const avgProgress = rows.reduce((acc, row) => acc + row.progress, 0) / rows.length;

  return {
    runCount: rows.length,
    completeRate,
    avgProgress,
    statusBuckets: aggregateStatusRows(rows),
    sampleWindow: `${Math.min(...rows.map((row) => row.snapshot.metrics['throughput::ratio'] ?? 0))}/${Math.max(...rows.map((row) => row.snapshot.metrics['throughput::ratio'] ?? 0))}`
  };
}

export function buildBucketReport<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenarioId: string,
  rows: readonly ChaosRunEnvelope<T>[]
): BucketReport {
  const sorted = [...rows].toSorted((left, right) => right.progress - left.progress);
  const summary = summarizeRuns(rows);
  return {
    namespace,
    scenarioId,
    totals: summary,
    latestRunId: sorted[0]?.runId,
    capturedAt: Date.now()
  };
}

export function buildStageHealth<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<T>[]
): readonly StageHealth[] {
  if (!rows.length) return [];

  const state = new Map<string, { runs: number; failures: number; progresses: number[] }>();

  for (const row of rows) {
    for (const stage of row.stages) {
      const current = state.get(stage.name) ?? { runs: 0, failures: 0, progresses: [] };
      current.runs += 1;
      if (row.status === 'failed') {
        current.failures += 1;
      }
      current.progresses.push(row.progress);
      state.set(stage.name, current);
    }
  }

  const buckets: StageHealth[] = [];
  for (const [stage, values] of state) {
    buckets.push({
      stage,
      runs: values.runs,
      failures: values.failures,
      p95Progress: percentile(values.progresses, 0.95)
    });
  }
  return buckets;
}

export function detectTrend(
  rows: readonly BucketReport[],
  cursor: QueryCursor | undefined
): Trend {
  const rates = rows.map((row) => row.totals.completeRate);
  const previous = rates.at(-2) ?? rates[0] ?? 0;
  const current = rates.at(-1) ?? previous;
  const delta = current - previous;
  const direction: TrendDirection =
    delta > 0.03 ? 'improving' : delta < -0.03 ? 'degrading' : 'flat';
  const severity: Severity =
    Math.abs(delta) > 0.25 ? 'critical' : Math.abs(delta) > 0.12 ? 'warning' : 'normal';
  void cursor;
  return {
    severity,
    direction,
    delta
  };
}

export function groupRunsByNamespace<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<T>[],
  namespace: string
): readonly RunByNamespace<string>[] {
  const grouped = new Map<string, ChaosRunEnvelope<T>[]>();
  for (const row of rows) {
    const key = `${row.namespace}/${row.scenarioId}` as string;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }
  return [...grouped.entries()].map(([key, groupedRows]) => ({ key, rows: groupedRows }));
}

export function collectMetricSignal<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<T>[]
): readonly { readonly key: string; readonly mean: number }[] {
  const aggregated = new Map<string, number[]>();
  for (const row of rows) {
    for (const sample of row.metrics.samples) {
      const metricKey = String(sample.metric);
      const bucket = aggregated.get(metricKey);
      if (bucket) {
        if (typeof sample.value === 'number') {
          bucket.push(sample.value);
        }
      } else if (typeof sample.value === 'number') {
        aggregated.set(metricKey, [sample.value]);
      }
    }
  }
  return [...aggregated.entries()].map(([key, values]) => ({
    key,
    mean: values.reduce((acc, value) => acc + value, 0) / Math.max(values.length, 1)
  }));
}

export function collectRuns<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<T>[]
): readonly ChaosRunEnvelope<T>[] {
  return [...rows];
}
