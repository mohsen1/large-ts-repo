import { Result, fail, ok } from '@shared/result';
import { InMemoryCockpitStore } from './memoryRepository';
import { PlanId, ReadinessEnvelope, RecoveryPlan, RuntimeRun } from '@domain/recovery-cockpit-models';
import { groupBy, normalizeNumber } from '@shared/util';
import { findCachedCriticalNodeIds } from './scenarioCache';

export type PlanProjection = Readonly<{
  readonly planId: PlanId;
  readonly version: number;
  readonly actionCount: number;
  readonly runCount: number;
  readonly readinessBaseline: number;
  readonly trend: 'improving' | 'stable' | 'degrading';
  readonly criticalCoverage: number;
  readonly regionalReadiness: ReadonlyArray<{ region: string; readiness: number }>;
}>;

const estimateReadinessFromRun = (run: RuntimeRun): number => {
  if (run.state === 'completed') return 100;
  if (run.state === 'failed' || run.state === 'cancelled') return 15;
  return Math.min(100, 45 + run.activeActionIds.length * 3);
};

const buildRegionalTrend = (runs: readonly RuntimeRun[]): ReadonlyArray<{ region: string; readiness: number }> => {
  const regionReadiness: Array<{ region: string; readiness: number }> = [];
  const regions = new Set<string>(runs.flatMap((run) => run.completedActions.map((action) => action.region)));

  for (const region of regions) {
    const subset = runs.flatMap((run) =>
      run.completedActions.filter((action) => action.region === region).map((action) => action.expectedDurationMinutes),
    );
    const avg = subset.length === 0 ? 0 : subset.reduce((acc, value) => acc + value, 0) / subset.length;
    regionReadiness.push({ region, readiness: normalizeNumber(avg * 5) });
  }

  if (regionReadiness.length === 0 && runs.length > 0) {
    const fallback = Math.min(100, runs.reduce((acc, run) => acc + estimateReadinessFromRun(run), 0) / runs.length);
    return [{ region: 'global', readiness: normalizeNumber(fallback) }];
  }

  return regionReadiness;
};

export const projectPlan = async (
  store: InMemoryCockpitStore,
  planId: PlanId,
): Promise<Result<PlanProjection, string>> => {
  const planResult = await store.getPlan(planId);
  if (!planResult.ok) {
    return fail(planResult.error);
  }
  if (!planResult.value) {
    return fail('plan-not-found');
  }

  const runsResult = await store.listRuns(planId);
  if (!runsResult.ok) {
    return fail(runsResult.error);
  }

  const plan = planResult.value;
  const runs = runsResult.value;
  const readinessSeries = runs.map(estimateReadinessFromRun);
  const latest = readinessSeries.at(-1) ?? 0;
  const previous = readinessSeries.at(-2) ?? latest;

  const projection = await buildPlanProjectionMeta(store, plan, runs);
  const trend = latest > previous ? 'improving' : latest < previous ? 'degrading' : 'stable';

  return ok({
    planId,
    version: plan.version,
    actionCount: plan.actions.length,
    runCount: runs.length,
    readinessBaseline: normalizeNumber(projection.readinessBaseline),
    trend,
    criticalCoverage: projection.criticalCoverage,
    regionalReadiness: projection.regionalReadiness,
  });
};

const buildPlanProjectionMeta = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
  runs: readonly RuntimeRun[],
): Promise<{
  readinessBaseline: number;
  criticalCoverage: number;
  regionalReadiness: ReadonlyArray<{ region: string; readiness: number }>;
}> => {
  const reads = runs.length === 0 ? 0 : runs.reduce((acc, run) => acc + run.completedActions.length, 0) / runs.length;
  const readinessBaseline = normalizeNumber(Math.min(100, 40 + reads));
  const cachedCriticalNodes = await findCachedCriticalNodeIds(store, plan.planId);
  const criticalCoverage = cachedCriticalNodes.ok
    ? Number((cachedCriticalNodes.value.length / Math.max(1, plan.actions.length)).toFixed(3))
    : 0;

  const regionalReadiness = buildRegionalTrend(runs);

  return { readinessBaseline, criticalCoverage, regionalReadiness };
};

export const mergeProjectedReadinessEnvelopes = (readiness: readonly ReadinessEnvelope[]): ReadonlyArray<ReadinessEnvelope> => {
  const grouped = groupBy(readiness, (entry) => entry.namespace);
  return grouped.map((group) => {
    const windows = group.values.flatMap((entry) => entry.windows);
    const baseline = Number((group.values.reduce((acc, entry) => acc + entry.baselineScore, 0) / Math.max(1, group.values.length)).toFixed(3));
    const sorted = [...windows].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
    return {
      planId: group.values[0]!.planId,
      namespace: group.key,
      baselineScore: baseline,
      windows: sorted,
    };
  });
};
