import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicies, isAllowed, riskScoreFromChecks } from '@domain/recovery-cockpit-intelligence';

export type PlanPolicyMode = 'readonly' | 'advisory' | 'enforce';

export type PolicyEvaluation = {
  allowed: boolean;
  checkCount: number;
  violationCount: number;
  riskScore: number;
  warnings: ReadonlyArray<string>;
  recommendations: ReadonlyArray<string>;
};

export const evaluatePlanPolicy = (plan: RecoveryPlan, mode: PlanPolicyMode): PolicyEvaluation => {
  const checks = evaluatePlanPolicies(plan, mode);
  return {
    allowed: isAllowed(checks),
    checkCount: checks.length,
    violationCount: checks.filter((entry) => !entry.allowed).length,
    riskScore: riskScoreFromChecks(checks),
    warnings: checks.filter((entry) => !entry.allowed).map((entry) => entry.violations).flat(),
    recommendations: checks
      .filter((entry) => entry.recommendations.length > 0)
      .map((entry) => entry.recommendations[0]),
  };
};

export const policyGate = (plan: RecoveryPlan, mode: PlanPolicyMode): boolean => {
  const result = evaluatePlanPolicy(plan, mode);
  if (mode === 'readonly') return true;
  return result.allowed;
};
