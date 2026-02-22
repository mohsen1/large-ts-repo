import { FulfillmentPolicy, FulfillmentPlan, StepState } from './types';

export interface PolicyViolation {
  path: string;
  message: string;
}

export const defaultPolicy: FulfillmentPolicy = {
  allowSplitFulfillment: true,
  maxConcurrentRuns: 5,
  riskThreshold: 0.62,
  requiredSkills: ['picker', 'packer', 'courier'],
};

export const normalizePolicy = (policy?: Partial<FulfillmentPolicy>): FulfillmentPolicy => ({
  ...defaultPolicy,
  ...policy,
});

export const validatePolicy = (policy: FulfillmentPolicy): PolicyViolation[] => {
  const violations: PolicyViolation[] = [];

  if (policy.maxConcurrentRuns <= 0) {
    violations.push({ path: 'maxConcurrentRuns', message: 'must be greater than zero' });
  }

  if (policy.riskThreshold < 0 || policy.riskThreshold > 1) {
    violations.push({ path: 'riskThreshold', message: 'must be between 0 and 1' });
  }

  if (!policy.requiredSkills.length) {
    violations.push({ path: 'requiredSkills', message: 'at least one skill required' });
  }

  return violations;
};

export const prioritizeTerminalStates = <TState>(states: readonly TState[], score: (state: TState) => number): readonly TState[] => {
  return [...states].sort((a, b) => score(b) - score(a));
};

export const canRunInParallel = (state: StepState): boolean => {
  return state === 'allocated' || state === 'picked';
};

export const guardClosedPlans = <TContext>(plan: FulfillmentPlan<TContext>): FulfillmentPlan<TContext> | undefined => {
  const hasFailedStep = plan.steps.some((step) => step.state === 'failed');
  if (hasFailedStep) return undefined;
  return plan;
};
