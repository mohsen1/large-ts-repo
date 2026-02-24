import type { MeshRuntimeEvent, MeshLane } from '@shared/orchestration-lab-core';
import type { ControlPlaneRunId } from './types';

export type ControlPlaneSeriesLabel = `control-plane:${string}`;
export type ControlPlaneAggregate = {
  readonly events: readonly MeshRuntimeEvent[];
  readonly runId: ControlPlaneRunId;
  readonly seedLane: MeshLane;
};

export interface TelemetryAccumulator {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
}

export interface ControlPlaneTelemetrySummary {
  readonly runId: string;
  readonly score: number;
  readonly confidence: number;
  readonly fingerprint: string;
  readonly policies: readonly string[];
}

export interface ControlPlanePolicyWeight<TName extends string = string> {
  readonly name: `policy:${TName}`;
  readonly weight: number;
};

export type RemappedTelemetry<TData extends Record<string, unknown>> = {
  [K in keyof TData as `cp:${Extract<K, string>}`]: TData[K];
};

export type TupleUnion<TValues extends readonly unknown[]> = TValues extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...TupleUnion<Tail>]
  : readonly [];

const initAccumulator = (): TelemetryAccumulator => ({
  count: 0,
  sum: 0,
  min: Number.POSITIVE_INFINITY,
  max: Number.NEGATIVE_INFINITY,
});

const addValue = (accumulator: TelemetryAccumulator, value: number): TelemetryAccumulator => ({
  count: accumulator.count + 1,
  sum: accumulator.sum + value,
  min: Math.min(accumulator.min, value),
  max: Math.max(accumulator.max, value),
});

export const aggregateEventSeries = (events: readonly MeshRuntimeEvent[]): readonly MeshRuntimeEvent[] =>
  events.toSorted((left, right) => left.at.localeCompare(right.at));

export const rankPoliciesByWeight = (policies: readonly { readonly name: string; readonly weight: number }[]): readonly string[] => {
  return policies.toSorted((left, right) => right.weight - left.weight).map((policy) => `${policy.name}:${policy.weight}`);
};

export const buildEventFingerprint = (events: readonly MeshRuntimeEvent[]): string =>
  events.map((entry) => `${entry.kind}:${entry.value}`).join('|');

export const computeSignal = (label: string, value: number): ControlPlaneSeriesLabel =>
  `control-plane:${label}` as ControlPlaneSeriesLabel;

export const summarizeControlSeries = (input: ControlPlaneAggregate): ControlPlaneTelemetrySummary => {
  const { count, sum, min, max } = input.events.reduce<TelemetryAccumulator>(
    (accumulator, event) => addValue(accumulator, event.value),
    initAccumulator(),
  );

  const normalizedCount = Math.max(1, count);
  const score = Number((sum / normalizedCount).toFixed(6));
  const confidence = Number((((sum - min) / Math.max(1, max - min)).toFixed(6)));
  const policies = input.events.map((entry) => entry.tags.join(':')).filter((entry) => entry.length > 0);
  const fingerprint = buildEventFingerprint(input.events);
  return {
    runId: input.runId,
    score: Number.isFinite(score) ? score : 0,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    fingerprint,
    policies,
  };
};

export const summarizeByLane = (events: readonly MeshRuntimeEvent[]): ReadonlyMap<MeshLane, number> => {
  const map = new Map<MeshLane, number>();
  for (const entry of events) {
    const [lane] = entry.tags;
    if (lane === undefined) {
      continue;
    }
    map.set(lane as MeshLane, (map.get(lane as MeshLane) ?? 0) + entry.value);
  }
  return map;
};

export const coalesceEvents = (
  ...events: readonly (readonly MeshRuntimeEvent[])[]
): readonly MeshRuntimeEvent[] => events.flatMap((chunk) => chunk);

export const summarizeMetricBuckets = (events: readonly MeshRuntimeEvent[]): {
  readonly buckets: Readonly<Record<`bucket:${string}`, number>>;
  readonly total: number;
} => {
  const buckets = new Map<string, number>();
  for (const event of events) {
    const bucket = `bucket:${event.kind}`;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return {
    buckets: Object.fromEntries([...buckets.entries()]),
    total: events.length,
  };
};
