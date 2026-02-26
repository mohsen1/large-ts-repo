import {
  mapWithIteratorHelpers,
  type KeyRemapWithNamespace,
  zipIterables,
} from '@shared/type-level';
import type { JsonLike, HorizonSignal, PluginStage, TimeMs } from '@domain/recovery-horizon-engine';
import type { ObservatoryStage, ObservatorySignalRecord, ObservatoryTenant, ObservatoryWindowId } from './observability-identity';

export type SeverityScore = 0 | 25 | 50 | 75 | 100;

export type MetricTuple<T extends readonly number[]> = T extends readonly [infer Head, ...infer Rest]
  ? [Head & number, ...MetricTuple<Rest & readonly number[]>]
  : [];

export type MetricKey<TTenant extends ObservatoryTenant, TStage extends ObservatoryStage> = `${TTenant}:${TStage}:metric:${number}`;

export interface StageMetricBucket<TStage extends ObservatoryStage = ObservatoryStage> {
  readonly stage: TStage;
  readonly signalCount: number;
  readonly errorCount: number;
  readonly weightedScore: SeverityScore;
  readonly window: ObservatoryWindowId;
}

type MutableStageMetricBucket<TStage extends ObservatoryStage = ObservatoryStage> = {
  stage: TStage;
  signalCount: number;
  errorCount: number;
  weightedScore: SeverityScore;
  window: ObservatoryWindowId;
};

export type StageMetricBuckets<TStages extends readonly ObservatoryStage[]> = {
  [S in TStages[number]]: StageMetricBucket<S>;
};

export type MetricMapFromBuckets<
  TBuckets extends readonly StageMetricBucket[],
> = KeyRemapWithNamespace<{
  [K in number as K extends keyof TBuckets ? TBuckets[K]['stage'] : never]: TBuckets[K]['signalCount'];
}, 'metric_'>;

export interface MetricDigest {
  readonly tenant: ObservatoryTenant;
  readonly totalSignals: number;
  readonly totalErrors: number;
  readonly stageBuckets: Readonly<Record<PluginStage, StageMetricBucket<PluginStage>>>;
  readonly trend: ReadonlyArray<SeverityScore>;
}

const toScore = (severity: ObservatorySignalRecord['severity']): SeverityScore => {
  if (severity === 'critical') {
    return 100;
  }
  if (severity === 'high') {
    return 75;
  }
  if (severity === 'medium') {
    return 50;
  }
  return 25;
};

const toSignalScore = (severity: string): SeverityScore => {
  if (severity === 'critical') {
      return 100;
  }
  if (severity === 'high') {
    return 75;
  }
  if (severity === 'medium') {
    return 50;
  }
  return 25;
};

const nowMs = (): TimeMs => Date.now() as TimeMs;

const emptyBucket = (tenant: ObservatoryTenant, stage: ObservatoryStage): MutableStageMetricBucket => ({
  stage,
  signalCount: 0,
  errorCount: 0,
  weightedScore: 25,
  window: (`${tenant}:${stage}:${nowMs()}` as ObservatoryWindowId),
});

export const initializeBuckets = (tenant: ObservatoryTenant): Record<PluginStage, MutableStageMetricBucket> => {
  return {
    ingest: emptyBucket(tenant, 'ingest'),
    analyze: emptyBucket(tenant, 'analyze'),
    resolve: emptyBucket(tenant, 'resolve'),
    optimize: emptyBucket(tenant, 'optimize'),
    execute: emptyBucket(tenant, 'execute'),
  };
};

export const accumulateSignals = (
  tenant: ObservatoryTenant,
  signals: readonly HorizonSignal<PluginStage, JsonLike>[],
): MetricDigest => {
  const buckets = initializeBuckets(tenant);
  let totalSignals = 0;
  let totalErrors = 0;
  for (const signal of signals) {
    totalSignals += 1;
    const bucket = buckets[signal.kind];
    bucket.signalCount += 1;
    if (signal.severity === 'critical' || signal.severity === 'high') {
      totalErrors += 1;
      bucket.errorCount += 1;
    }
      bucket.weightedScore = Math.min(100, bucket.weightedScore + toScore(signal.severity)) as SeverityScore;
  }
  return {
    tenant,
    totalSignals,
    totalErrors,
    stageBuckets: buckets,
    trend: mapWithIteratorHelpers(signals, (signal, _, total) => {
      const ratio = total > 0 ? Math.round((totalErrors / (total || 1)) * 100) : 0;
      return Math.min(100, ratio) as SeverityScore;
    }),
  };
};

export type WeightedVector<T extends readonly number[]> = T extends readonly [infer Head, ...infer Rest]
  ? [Head & number, ...WeightedVector<Rest & readonly number[]>]
  : [];

export const zipSignalStats = <
  TLeft extends readonly number[],
  TRight extends readonly number[],
>(
  left: TLeft,
  right: TRight,
): readonly [TLeft[number], TRight[number]][] => {
  return zipIterables(left, right) as unknown as readonly [TLeft[number], TRight[number]][];
};

export const bucketFromSignalRecord = (
  signal: ObservatorySignalRecord,
  index: number,
): StageMetricBucket => ({
  stage: signal.stage,
  signalCount: index + 1,
  errorCount: signal.severity === 'critical' || signal.severity === 'high' ? 1 : 0,
  weightedScore: toSignalScore(signal.severity),
  window: signal.manifest.windowId,
});

const mergeBucket = (left: StageMetricBucket, right: StageMetricBucket): StageMetricBucket => ({
  stage: left.stage,
  signalCount: left.signalCount + right.signalCount,
  errorCount: left.errorCount + right.errorCount,
  weightedScore: Math.min(100, left.weightedScore + right.weightedScore) as SeverityScore,
  window: right.window,
});

export const mergeDigest = (left: MetricDigest, right: MetricDigest): MetricDigest => {
  const merged = initializeBuckets(left.tenant);
  const stages = Object.keys(merged) as PluginStage[];
  for (const stage of stages) {
    merged[stage] = mergeBucket(
      merged[stage],
      right.stageBuckets[stage],
    );
  }
  return {
    tenant: left.tenant,
    totalSignals: left.totalSignals + right.totalSignals,
    totalErrors: left.totalErrors + right.totalErrors,
    stageBuckets: merged,
    trend: [
      ...left.trend,
      ...right.trend,
    ] as readonly SeverityScore[],
  };
};
