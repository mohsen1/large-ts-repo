import { AUTONOMY_SCOPE_SEQUENCE, type AutonomyScope, type AutonomySignalEnvelope, type AutonomyRunId } from '@domain/recovery-autonomy-graph';
import type { OrchestrationRunState } from './types';

export interface RunAnalytics {
  readonly runId: AutonomyRunId;
  readonly scopeBuckets: Readonly<Record<AutonomyScope, number>>;
  readonly hotScopes: readonly AutonomyScope[];
  readonly healthScore: number;
}

export interface HealthTrend {
  readonly runId: AutonomyRunId;
  readonly snapshots: readonly number[];
  readonly stageCount: number;
}

export const buildRunAnalytics = (
  runId: AutonomyRunId,
  run: OrchestrationRunState,
): RunAnalytics => {
  const scopeBuckets = AUTONOMY_SCOPE_SEQUENCE.reduce<Record<AutonomyScope, number>>((acc, scope) => {
    acc[scope] = run.signals.filter((signal) => signal.scope === scope).length;
    return acc;
  }, {} as Record<AutonomyScope, number>);

  const hotScopes = AUTONOMY_SCOPE_SEQUENCE.filter((scope) => scopeBuckets[scope] > 0);
  const signalCount = run.signals.length || 1;
  const pluginLoad = run.outputs.reduce((acc, item) => acc + Number(item.diagnostics.length), 0);
  const healthScore = Math.max(0, 100 - (signalCount * 4) + pluginLoad);

  return {
    runId,
    scopeBuckets,
    hotScopes,
    healthScore,
  };
};

export const trendForRun = (runs: readonly OrchestrationRunState[]): HealthTrend => {
  const snapshots: number[] = runs.map((run, index) => {
    return (run.metrics?.signalCount ?? 0) + (run.metrics?.pluginCount ?? 0) + index;
  });

  const stageCount = new Set(
    runs.flatMap((run) => run.signals.map((signal) => signal.scope)),
  ).size;

  const runId = runs.at(-1)?.signals?.[0]?.runId ?? ('run:unknown' as AutonomyRunId);
  return {
    runId,
    snapshots,
    stageCount,
  };
};

export const signalsByScope = (
  signals: readonly AutonomySignalEnvelope[],
): Readonly<Record<AutonomyScope, readonly AutonomySignalEnvelope[]>> => {
  const buckets = AUTONOMY_SCOPE_SEQUENCE.reduce<Record<AutonomyScope, AutonomySignalEnvelope[]>>((acc, scope) => {
    acc[scope] = [];
    return acc;
  }, {} as Record<AutonomyScope, AutonomySignalEnvelope[]>);

  for (const signal of signals) {
    buckets[signal.scope].push(signal);
  }

  return buckets;
};

export const buildRunSummary = (
  scopeBuckets: Readonly<Record<AutonomyScope, number>>,
  metrics: Readonly<Record<AutonomyScope, number>>,
): string => {
  const noisy = Object.entries(scopeBuckets)
    .filter(([, value]) => value > 7)
    .map(([scope]) => scope)
    .join(',');
  const topScope = (Object.entries(scopeBuckets) as [AutonomyScope, number][])
    .toSorted((left, right) => right[1] - left[1])[0]?.[0] ?? 'discover';

  const pluginLoad = Object.values(metrics).reduce((acc, value) => acc + value, 0);
  return `${noisy ? `noisy=${noisy}` : 'balanced'}::top=${topScope}::plugin-load=${pluginLoad}`;
};
