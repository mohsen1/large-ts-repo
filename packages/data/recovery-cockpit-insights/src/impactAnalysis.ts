import { RecoveryPlan, UtcIsoTimestamp, PlanId, RuntimeRun, CockpitSignal, RecoveryAction } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitInsightsStore } from './inMemoryInsightsStore';
import { PlanInsight } from './insightModels';

type PlanPolicySignature = {
  readonly overallScore: number;
};

export type ImpactVector = {
  readonly planId: PlanId;
  readonly signalCount: number;
  readonly failedActionCount: number;
  readonly estimatedRecoveryMinutes: number;
  readonly policyDelta: number;
  readonly trend: 'improving' | 'regressing' | 'flat';
  readonly reviewedAt: UtcIsoTimestamp;
};

export type ImpactSnapshot = {
  readonly impactByPlan: ReadonlyArray<ImpactVector>;
  readonly reviewedAt: UtcIsoTimestamp;
  readonly summary: string;
};

const estimateRecovery = (actions: readonly RecoveryAction[]): number =>
  actions.reduce((acc, action) => acc + action.expectedDurationMinutes, 0);

const trendFromSignals = (signals: readonly CockpitSignal[], baseline: number): ImpactVector['trend'] => {
  if (signals.length === 0) return 'flat';
  const latest = signals.at(-1);
  if (!latest) return 'flat';
  const severity = (latest as { score?: number })?.score ?? 0;
  return severity > baseline ? 'regressing' : severity < baseline ? 'improving' : 'flat';
};

export const buildImpactVector = (
  plan: RecoveryPlan,
  runs: readonly RuntimeRun[],
  signals: readonly CockpitSignal[],
): ImpactVector => {
  const failed = runs.reduce((acc, run) => acc + run.failedActions.length, 0);
  const baselineSignals = signals.length;
  const policy = runs.length === 0 ? 0 : Number((failed / (runs.length + 1)).toFixed(2));
  const trend = trendFromSignals(signals, baselineSignals);
  return {
    planId: plan.planId,
    signalCount: baselineSignals,
    failedActionCount: failed,
    estimatedRecoveryMinutes: estimateRecovery(plan.actions),
    policyDelta: policy,
    trend,
    reviewedAt: new Date().toISOString() as UtcIsoTimestamp,
  };
};

export const hydrateImpactSnapshot = async (
  store: InMemoryCockpitInsightsStore,
  plans: readonly RecoveryPlan[],
  policyByPlan: ReadonlyMap<PlanId, PlanPolicySignature>,
  signalsByPlan: ReadonlyMap<PlanId, readonly CockpitSignal[]>,
  runsByPlan: ReadonlyMap<PlanId, readonly RuntimeRun[]>,
): Promise<ImpactSnapshot> => {
  const impacts = plans.map((plan) =>
    buildImpactVector(
      plan,
      runsByPlan.get(plan.planId) ?? [],
      signalsByPlan.get(plan.planId) ?? [],
    ),
  );
  let highRiskCount = 0;
  let stableCount = 0;

  for (const impact of impacts) {
    if (impact.policyDelta > 5 || impact.failedActionCount > 2) {
      highRiskCount += 1;
    } else {
      stableCount += 1;
    }
  }

  await Promise.all(
    impacts.map(async (impact) => {
      const policy = policyByPlan.get(impact.planId);
      const summary = `impact=${impact.signalCount},failed=${impact.failedActionCount},recovery=${impact.estimatedRecoveryMinutes}`;
      const insight: PlanInsight = {
        planId: impact.planId,
        summary,
        createdAt: new Date().toISOString(),
        runCount: runsByPlan.get(impact.planId)?.length ?? 0,
        forecastSummary: impact.estimatedRecoveryMinutes,
        score: {
          planId: impact.planId,
          risk: impact.policyDelta * 11,
          readiness: Math.max(0, 100 - impact.estimatedRecoveryMinutes / 2),
          policy: policy?.overallScore ?? 0,
          health: stableCount > highRiskCount ? 'green' : 'red',
          reasons: [summary, `trend:${impact.trend}`],
        },
      };
      await store.upsertInsight(insight);
    }),
  );

  return {
    impactByPlan: impacts,
    reviewedAt: new Date().toISOString() as UtcIsoTimestamp,
    summary: `${impacts.length} plans, highRisk=${highRiskCount}, stable=${stableCount}`,
  };
};

export const summarizeImpact = (snapshot: ImpactSnapshot): string =>
  `${snapshot.summary} @${snapshot.reviewedAt}`;
