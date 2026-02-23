import { PlanId, ReadinessEnvelope, RecoveryPlan } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from './memoryRepository';

export type HeatLevel = 'green' | 'amber' | 'red';

export const computeReadinessScore = (windows: ReadinessEnvelope['windows']): number => {
  if (windows.length === 0) return 100;
  const score = windows.reduce((acc, window) => acc + Math.max(0, 100 - window.score), 0) / windows.length;
  return Number((100 - score).toFixed(1));
};

export const toHeatLevel = (score: number): HeatLevel => {
  if (score >= 85) return 'green';
  if (score >= 65) return 'amber';
  return 'red';
};

export const sortPlansByReadiness = (plans: RecoveryPlan[]): RecoveryPlan[] =>
  [...plans].sort((left, right) => right.slaMinutes - left.slaMinutes);

export const filterPlansByMode = (plans: RecoveryPlan[], mode: 'automated' | 'manual' | 'semi'): RecoveryPlan[] =>
  plans.filter((plan) => plan.mode === mode);

export const summarizePlans = async (
  store: InMemoryCockpitStore,
): Promise<ReadonlyArray<{ plan: PlanId; score: number; heat: HeatLevel }>> => {
  const plansResult = await store.listPlans();
  if (!plansResult.ok) {
    return [];
  }
  return plansResult.value.map((plan) => ({
    plan: plan.planId,
    score: plan.slaMinutes,
    heat: toHeatLevel(100 - Math.min(plan.slaMinutes, 100)),
  }));
};
