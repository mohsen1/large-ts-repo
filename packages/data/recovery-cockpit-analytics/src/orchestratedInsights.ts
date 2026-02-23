import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { RecoveryPlan, PlanId, CockpitSignal } from '@domain/recovery-cockpit-models';
import { buildHealthMatrix, buildDependencyInsight } from '@domain/recovery-cockpit-intelligence';
import { buildCoverageDimensions, rankCoverage, scoreCoverage } from './coverageScoring';
import { groupBy } from '@shared/util';

export type PlanHealth = 'green' | 'yellow' | 'red';

type SignalReader = {
  latestSignals(planId: PlanId): Promise<readonly CockpitSignal[]>;
  getInsight?(planId: PlanId): Promise<unknown>;
};

export type OrchestratedProfile = {
  readonly planId: PlanId;
  readonly plan: RecoveryPlan;
  readonly score: number;
  readonly health: PlanHealth;
  readonly risk: number;
  readonly dependencyHealth: ReturnType<typeof buildDependencyInsight>;
  readonly coverageRationale: readonly string[];
};

export type OrchestrationBoard = {
  readonly generatedAt: string;
  readonly total: number;
  readonly byHealth: Readonly<Record<PlanHealth, number>>;
  readonly profiles: readonly OrchestratedProfile[];
};

const buildProfile = async (
  plan: RecoveryPlan,
  store: InMemoryCockpitStore,
  insights: SignalReader,
): Promise<OrchestratedProfile> => {
  const matrix = buildHealthMatrix(plan, [], {
    policyMode: 'advisory',
    includeSignals: true,
    signalCap: 50,
  });

  const signals = await insights.latestSignals(plan.planId);
  const coverage = await buildCoverageDimensions(plan, store, undefined);
  const coverageScore = scoreCoverage(coverage);
  const dependencyInsight = buildDependencyInsight(plan);
  const risk = 100 - coverage.forecastCoverage * 100;
  const matrixHealth: PlanHealth =
    matrix.score >= 85 && risk < 25
      ? 'green'
      : matrix.score >= 65 && risk < 60
        ? 'yellow'
        : 'red';

  await insights.getInsight?.(plan.planId);

  return {
    planId: plan.planId,
    plan,
    score: Number(((coverageScore * 100) + matrix.score).toFixed(2)),
    health: matrixHealth,
    risk,
    dependencyHealth: dependencyInsight,
    coverageRationale: ['matrix', ...coverageSignatures(coverage, signals)],
  };
};

const coverageSignatures = (
  coverage: { health: number; forecastCoverage: number; policyCoverage: number; slaCoverage: number },
  signals: readonly CockpitSignal[],
): string[] => [
  `health=${coverage.health.toFixed(2)}`,
  `forecast=${coverage.forecastCoverage.toFixed(2)}`,
  `policy=${coverage.policyCoverage.toFixed(2)}`,
  `sla=${coverage.slaCoverage.toFixed(2)}`,
  `signals=${signals.length}`,
];

export const buildOrchestrationBoard = async (
  store: InMemoryCockpitStore,
  insights: SignalReader,
): Promise<OrchestrationBoard> => {
  const plans = await store.listPlans();
  if (!plans.ok) {
    return {
      generatedAt: new Date().toISOString(),
      total: 0,
      byHealth: { green: 0, yellow: 0, red: 0 },
      profiles: [],
    };
  }

  const rankedCoverage = await rankCoverage(plans.value, store, insights);
  const profileByPlan = new Map<string, OrchestratedProfile>();
  for (const rankedPlan of plans.value) {
    const existing = rankedCoverage.find((entry) => entry.planId === rankedPlan.planId);
    if (!existing) {
      continue;
    }
    const profile = await buildProfile(rankedPlan, store, insights);
    profileByPlan.set(profile.planId, profile);
  }

  const profiles = [...profileByPlan.values()].sort((left, right) => right.score - left.score);
  const byHealth = groupBy(profiles, (item) => item.health).reduce(
    (acc, bucket) => {
      acc[bucket.key as PlanHealth] = bucket.values.length;
      return acc;
    },
    { green: 0, yellow: 0, red: 0 } as Record<PlanHealth, number>,
  );

  return {
    generatedAt: new Date().toISOString(),
    total: profiles.length,
    byHealth,
    profiles,
  };
};
