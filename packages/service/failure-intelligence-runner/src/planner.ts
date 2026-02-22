import { buildPlan, summarizePlan } from '@domain/failure-intelligence';
import { type FailureActionPlan, type FailureSignal } from '@domain/failure-intelligence';

export interface PlanExecution {
  plan: FailureActionPlan;
  summary: string;
}

export const draftPlan = (signals: readonly FailureSignal[]): PlanExecution | undefined => {
  const plan = buildPlan(signals);
  if (!plan) return;
  return { plan, summary: summarizePlan(plan) };
};
