import { Result, ok, fail } from '@shared/result';
import { ContinuityPolicy, ContinuityPlanTemplate, ContinuityRunState, ContinuityRuntimePlan, ContinuityExecutionContext, ContinuityEventEnvelope } from './types';

export type ValidationError = { reason: string; field?: string };

export interface ContinuityAdapterRegistry {
  getPolicy(tenantId: string): Promise<ContinuityPolicy | undefined>;
  registerPolicy(policy: ContinuityPolicy): Promise<void>;
  getPlansForTenant(tenantId: string): Promise<readonly ContinuityPlanTemplate[]>;
}

export interface ContinuitySignalBus {
  publish<C = Record<string, unknown>>(envelope: ContinuityEventEnvelope<C>): Promise<void>;
}

export interface ContinuityRunStore {
  put(plan: ContinuityRuntimePlan): Promise<void>;
  get(planId: string): Promise<ContinuityRuntimePlan | null>;
  updateState(planId: string, state: ContinuityRunState): Promise<void>;
  byTenant(tenantId: string): Promise<readonly ContinuityRuntimePlan[]>;
}

export interface ContinuityOrchestratorAdapter {
  execute(plan: ContinuityRuntimePlan, context: ContinuityExecutionContext): Promise<Result<void, string>>;
}

export const validatePolicyForPlan = (
  policy: ContinuityPolicy,
  plan: ContinuityPlanTemplate,
): Result<void, ValidationError> => {
  if (policy.tenantId !== plan.tenantId) {
    return fail({ reason: 'tenant-mismatch', field: 'tenantId' });
  }
  if (policy.minPriority === 'low' && plan.severity === 'critical') {
    return fail({ reason: 'policy-priority-too-low', field: 'minPriority' });
  }
  return ok(undefined);
};

export const canRunInTenant = (policy: ContinuityPolicy, tenantId: string): boolean =>
  policy.tenantId === tenantId;
