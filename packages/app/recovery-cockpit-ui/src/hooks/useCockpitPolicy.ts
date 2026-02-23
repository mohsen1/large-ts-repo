import { useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicy } from '@service/recovery-cockpit-orchestrator';

export type PolicyDecision = {
  planId: string;
  allowed: boolean;
  riskScore: number;
  recommendations: string[];
};

export const useCockpitPolicy = (plans: readonly RecoveryPlan[]): readonly PolicyDecision[] =>
  useMemo(
    () =>
      plans.map((plan) => {
        const evaluation = evaluatePlanPolicy(plan, 'advisory');
        return {
          planId: plan.planId,
          allowed: evaluation.allowed,
          riskScore: evaluation.riskScore,
          recommendations: [...evaluation.recommendations],
        };
      }),
    [plans],
  );

export const useTopRiskyPlan = (decisions: readonly PolicyDecision[]): PolicyDecision | undefined =>
  useMemo(() => {
    if (decisions.length === 0) return undefined;
    return [...decisions].sort((left, right) => left.riskScore - right.riskScore)[0];
  }, [decisions]);
