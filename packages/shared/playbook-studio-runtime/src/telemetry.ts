import { mapWithIteratorHelpers } from '@shared/type-level';
import { withBrand } from '@shared/core';
import { traceId, type RunId } from './ids';

export type StudioMetricName = `metric:${string}`;

export interface StudioMetric<TName extends StudioMetricName = StudioMetricName> {
  readonly name: TName;
  readonly value: number;
  readonly unit: 'ms' | 'count' | 'ratio';
  readonly runId: RunId;
  readonly labels: Record<string, string>;
}

export interface StudioEvent<TKind extends string = string> {
  readonly kind: `event:${TKind}`;
  readonly runId: RunId;
  readonly traceId: string;
  readonly at: string;
  readonly payload: Record<string, unknown>;
}

export interface StudioSnapshot {
  readonly runId: RunId;
  readonly metrics: readonly StudioMetric[];
  readonly events: readonly StudioEvent[];
}

export type MetricBucket = Map<string, { count: number; sum: number }>;

export type MetricAccumulator = {
  readonly min: number;
  readonly max: number;
  readonly values: readonly number[];
};

export const metricName = <const TTag extends string>(tag: TTag): `metric:${TTag}` => `metric:${tag}`;

export const createMetric = <TName extends StudioMetricName>(
  runId: RunId,
  traceIdInput: string,
  name: TName,
  value: number,
): StudioMetric<TName> => ({
  name,
  value,
  unit: value <= 1 ? 'ratio' : Number.isInteger(value) ? 'count' : 'ms',
  runId,
  labels: {
    run: String(runId),
    trace: traceIdInput,
    unit: String(value),
  },
});

export const createEvent = <TKind extends string>(
  runId: RunId,
  traceIdInput: string,
  kind: TKind,
  payload: Record<string, unknown> = {},
): StudioEvent<TKind> => ({
  kind: `event:${kind}`,
  runId,
  traceId: traceIdInput,
  at: new Date().toISOString(),
  payload,
});

export const addMetric = (
  bucket: MetricBucket,
  metric: StudioMetric,
): MetricBucket => {
  const existing = bucket.get(metric.name);
  if (existing) {
    existing.count += 1;
    existing.sum += metric.value;
  } else {
    bucket.set(metric.name, { count: 1, sum: metric.value });
  }
  return bucket;
};

export const bucketify = (snapshot: StudioSnapshot): MetricBucket => {
  const initial = new Map<string, { count: number; sum: number }>();
  for (const metric of snapshot.metrics) {
    addMetric(initial, metric);
  }
  return initial;
};

export const summarize = (snapshot: StudioSnapshot): Record<string, number> => {
  const bucket = bucketify(snapshot);
  const out: Record<string, number> = {};
  for (const [key, { count, sum }] of bucket.entries()) {
    out[`${key}.count`] = count;
    out[`${key}.sum`] = sum;
    out[`${key}.avg`] = count === 0 ? 0 : sum / count;
  }
  return out;
};

export const eventIterator = (snapshot: StudioSnapshot): IterableIterator<StudioEvent> => {
  const events = snapshot.events;
  let index = 0;
  return {
    next() {
      if (index >= events.length) return { done: true, value: undefined };
      const value = events[index];
      index += 1;
      return { value, done: false };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
};

export const eventKeys = (snapshot: StudioSnapshot): readonly string[] =>
  mapWithIteratorHelpers(eventIterator(snapshot), (event) => `${event.kind}:${event.at}`);

export const foldMetrics = (snapshot: StudioSnapshot): readonly [string, MetricAccumulator][] => {
  const fold = new Map<string, number[]>();
  for (const metric of snapshot.metrics) {
    const values = fold.get(metric.name);
    if (values) {
      values.push(metric.value);
    } else {
      fold.set(metric.name, [metric.value]);
    }
  }

  const rows: [string, MetricAccumulator][] = [];
  for (const [name, values] of fold.entries()) {
    const sorted = values.toSorted((left, right) => left - right);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    rows.push([name, { min, max, values: sorted }]);
  }

  return rows;
};
