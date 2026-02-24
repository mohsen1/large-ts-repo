import {
  type IntentExecutionResult,
  type IntentGraphId,
  type IntentPolicy,
  type IntentStage,
  type PluginContract,
  type PluginResult,
  type IntentNodePayload,
  type IntentTelemetry,
  type PluginSuccess,
} from './types';

type StageStats = {
  stage: IntentStage;
  sampleCount: number;
  averageMs: number;
  p95Ms: number;
  failures: number;
};

type IteratorChain<T> = {
  toArray(): T[];
  map<U>(transform: (value: T) => U): { toArray(): U[] };
};

const iteratorFrom = (globalThis as { readonly Iterator?: { readonly from?: <T>(value: Iterable<T>) => IteratorChain<T> } })
  .Iterator?.from;

const asArray = <T>(values: Iterable<T>): readonly T[] =>
  iteratorFrom?.(values)?.toArray() ?? Array.from(values);

export interface HealthSnapshot {
  readonly graphId: IntentGraphId;
  readonly stageBuckets: readonly StageStats[];
  readonly confidence: number;
  readonly recommendations: readonly string[];
}

export const toPolicySummary = <TCatalog extends readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>(
  policy: IntentPolicy<TCatalog>,
): string =>
  [
    `graph=${policy.id}`,
    `tenant=${policy.tenant}`,
    `stages=${policy.steps.length}`,
    `plugins=${policy.plugins.length}`,
    `channel=${policy.channel}`,
  ].join(' | ');

export const buildHealth = (graphId: IntentGraphId, telemetry: readonly IntentTelemetry[]): HealthSnapshot => {
  const stageValues = {
    capture: asArray(telemetry).map((item) => item.stageTimings.capture),
    normalize: asArray(telemetry).map((item) => item.stageTimings.normalize),
    score: asArray(telemetry).map((item) => item.stageTimings.score),
    recommend: asArray(telemetry).map((item) => item.stageTimings.recommend),
    simulate: asArray(telemetry).map((item) => item.stageTimings.simulate),
    resolve: asArray(telemetry).map((item) => item.stageTimings.resolve),
  };

  const buckets = (['capture', 'normalize', 'score', 'recommend', 'simulate', 'resolve'] as const).map((stage) => {
    const durations = stageValues[stage];
    const sorted = durations.toSorted((left, right) => left - right);
    const average = sorted.length === 0 ? 0 : sorted.reduce((acc, value) => acc + value, 0) / sorted.length;
    const p95 = sorted[Math.max(0, Math.floor((sorted.length - 1) * 0.95))] ?? 0;
    return {
      stage,
      sampleCount: sorted.length,
      averageMs: Number.isFinite(average) ? average : 0,
      p95Ms: p95,
      failures: sorted.filter((value) => value === 0).length,
    };
  });

  const recommendations = asArray(telemetry)
    .filter((item) => item.elapsedMs > 700)
    .map((item) => `slow:${item.nodeId}:${item.elapsedMs}`);
  const confidence = recommendations.length === 0 ? 0.99 : Math.max(0, 1 - recommendations.length / Math.max(1, telemetry.length));

  return {
    graphId,
    stageBuckets: buckets,
    confidence,
    recommendations: recommendations.toSpliced(12),
  };
};

export const summarizeExecutions = (graphId: IntentGraphId, outcomes: readonly IntentExecutionResult[]): {
  readonly graphId: IntentGraphId;
  readonly passed: number;
  readonly failed: number;
  readonly averageConfidence: number;
  readonly fingerprint: string;
} => {
  const passed = outcomes.filter((result) => result.ok).length;
  const failed = outcomes.length - passed;
  const averageConfidence =
    outcomes.length === 0 ? 0 : outcomes.reduce((acc, value) => acc + value.confidence, 0) / outcomes.length;

  const fingerprint = asArray(outcomes)
    .map((outcome) => `${outcome.runId}:${outcome.tenant}:${outcome.confidence.toFixed(4)}`)
    .toSorted((left, right) => right.localeCompare(left))
    .join(',');

  return {
    graphId,
    passed,
    failed,
    averageConfidence,
    fingerprint,
  };
};

export const summarizeResults = (outcomes: readonly PluginResult[]): {
  readonly succeeded: number;
  readonly failed: number;
  readonly ratio: number;
} => {
  const succeeded = outcomes.filter((result): result is PluginSuccess<IntentNodePayload> => result.ok).length;
  const failed = outcomes.length - succeeded;
  return {
    succeeded,
    failed,
    ratio: outcomes.length === 0 ? 0 : succeeded / outcomes.length,
  };
};
