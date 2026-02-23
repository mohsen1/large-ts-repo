import { RecoveryPlan, CockpitSignal } from '@domain/recovery-cockpit-models';
import { buildHealthMatrix } from '@domain/recovery-cockpit-intelligence';
import { InMemoryCockpitInsightsStore } from './inMemoryInsightsStore';
import { PlanInsight, PlanHealth } from './insightModels';

export type ImpactSlice = {
  readonly planId: string;
  readonly health: PlanHealth;
  readonly riskScore: number;
  readonly signalCount: number;
  readonly matrixScore: number;
  readonly riskBand: 'low' | 'medium' | 'high' | 'critical';
};

const riskBand = (readiness: number, policy: number): 'low' | 'medium' | 'high' | 'critical' => {
  const score = (readiness + policy) / 2;
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 35) return 'high';
  return 'critical';
};

const asHealth = (band: 'low' | 'medium' | 'high' | 'critical'): PlanHealth => {
  if (band === 'low') return 'green';
  if (band === 'medium') return 'yellow';
  return 'red';
};

export const classifyImpact = (plan: RecoveryPlan, signals: readonly CockpitSignal[]): ImpactSlice => {
  const matrix = buildHealthMatrix(plan, signals, {
    policyMode: 'advisory',
    includeSignals: true,
    signalCap: 25,
  });

  const health = matrix.severityBand;
  const signalCount = signals.length;
  return {
    planId: plan.planId,
    health: asHealth(health),
    riskScore: matrix.score,
    signalCount,
    matrixScore: matrix.cells.reduce((acc, cell) => acc + cell.score, 0),
    riskBand: riskBand(matrix.cells[0]?.score ?? 0, matrix.cells[1]?.score ?? 0),
  };
};

export const rankImpacts = (values: readonly ImpactSlice[]): readonly ImpactSlice[] =>
  [...values].sort((left, right) => right.riskScore - left.riskScore);

export const impactDigest = (values: readonly ImpactSlice[]): string =>
  values.map((value) => `${value.planId}:${value.health}:${value.riskScore}`).join(' ; ');

export const hydrateImpactMap = async (
  store: InMemoryCockpitInsightsStore,
  plans: readonly RecoveryPlan[],
  signalsByPlan: ReadonlyMap<string, readonly CockpitSignal[]>,
): Promise<ReadonlyMap<string, ImpactSlice>> => {
  const entries: Array<[string, ImpactSlice]> = [];

  for (const plan of plans) {
    const signals = signalsByPlan.get(plan.planId) ?? [];
    const impact = classifyImpact(plan, signals);
    const insight = await store.getInsight(plan.planId);
    if (!insight) {
      entries.push([plan.planId, impact]);
      continue;
    }
    entries.push([
      plan.planId,
      {
        ...impact,
        matrixScore: Number((impact.matrixScore + normalizeInsightScore(insight)).toFixed(2)),
      },
    ]);
  }

  return new Map(entries);
};

const normalizeInsightScore = (insight: PlanInsight): number => {
  const value = insight.score.readiness + insight.score.policy - insight.score.risk;
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
};
