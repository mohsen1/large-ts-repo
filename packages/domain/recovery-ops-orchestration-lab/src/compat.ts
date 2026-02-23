import type { LabPlan, OrchestrationLab, OrchestrationPolicy } from './types';
import { scorePlan } from './policy';

export const brandCommandStepId = (value: string): string & { readonly __brand: 'CommandStepId' } => value as string & { readonly __brand: 'CommandStepId' };

export const normalizePlans = (plans: readonly LabPlan[]): readonly LabPlan[] =>
  [...plans].sort((left, right) => right.score - left.score);

export const pickPlanByPolicy = (
  lab: OrchestrationLab,
  compare: (left: { readonly score: number }, right: { readonly score: number }) => number,
): LabPlan | undefined => [...lab.plans].sort(compare)[0];

export const selectBestPlanByPolicy = (lab: OrchestrationLab, policy: OrchestrationPolicy): LabPlan | undefined => {
  const candidates = lab.plans
    .map((plan) => ({
      plan,
      score: scorePlan(plan, policy).readiness,
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.plan);
  return candidates[0];
};

export const parsePlanId = (value: string): LabPlan['id'] => value as LabPlan['id'];

export const parseLabId = (value: string): OrchestrationLab['id'] => value as OrchestrationLab['id'];
