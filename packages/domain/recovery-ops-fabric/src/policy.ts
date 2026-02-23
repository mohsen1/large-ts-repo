import { type FabricPolicy, type FabricPlan, type FabricPolicyResult, type FabricPolicyViolation } from './models';
import { validatePlanByPolicy } from './forecast';

export interface PolicyBundle {
  readonly policy: FabricPolicy;
  readonly policyVersion: string;
  readonly issuedAt: string;
}

export interface PolicyCheck {
  readonly policyVersion: string;
  readonly result: FabricPolicyResult;
  readonly checkedAt: string;
}

type MutablePolicyResult = {
  ok: boolean;
  violations: FabricPolicyViolation[];
};

export const defaultPolicy = (): FabricPolicy => ({
  tenantId: 'tenant-fabric-default' as any,
  allowedRoles: ['routing', 'compute', 'persist'],
  maxActionPerMinute: 30,
  allowRiskIncrease: 0.4,
  preferredActions: ['shift-traffic', 'repair-route', 'scale-up', 'throttle'],
});

export const validatePolicyBundle = (candidate: PolicyBundle): PolicyCheck => {
  const result: MutablePolicyResult = {
    ok: true,
    violations: [],
  };

  if (candidate.policy.allowRiskIncrease < 0.01) {
    result.ok = false;
    result.violations.push({ field: 'constraint', reason: 'maxRisk too strict', severity: 'warning' });
  }
  if (candidate.policy.maxActionPerMinute <= 0) {
    result.ok = false;
    result.violations.push({
      field: 'policy',
      reason: 'maxActionPerMinute must be greater than zero',
      severity: 'incident',
    });
  }

  return {
    policyVersion: candidate.policyVersion,
    result,
    checkedAt: new Date().toISOString(),
  };
};

export const evaluatePlanPolicy = (plan: FabricPlan, policy: FabricPolicy): PolicyCheck => {
  const result = validatePlanByPolicy(plan, policy);
  return {
    policyVersion: `policy-${policy.tenantId}-${new Date().toISOString()}`,
    result,
    checkedAt: new Date().toISOString(),
  };
};

export const summarizePolicy = (bundle: PolicyBundle, plans: readonly FabricPlan[]): string => {
  const averageSteps = plans.length === 0
    ? 0
    : Math.round(plans.reduce((sum, plan) => sum + plan.steps.length, 0) / plans.length);
  return `${bundle.policy.tenantId}: ${plans.length} plans, avg steps ${averageSteps}`;
};
