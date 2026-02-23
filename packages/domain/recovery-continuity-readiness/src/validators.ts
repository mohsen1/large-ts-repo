import { fail, ok, type Result } from '@shared/result';
import {
  ContinuityReadinessIds,
  type ContinuityReadinessCandidatePlan,
  type ContinuityReadinessEnvelope,
  type ContinuityReadinessSurface,
  type ContinuityReadinessRun,
} from './types';

export interface ContinuityReadinessValidationContext {
  readonly minPlanCount: number;
  readonly minSignalCoverage: number;
}

export const validateSurface = (surface: ContinuityReadinessSurface): Result<ContinuityReadinessSurface, Error> => {
  if (!surface.id) {
    return fail(new Error('surface id required'));
  }
  if (!surface.tenantId) {
    return fail(new Error('surface tenant required'));
  }
  if (surface.plans.length === 0) {
    return fail(new Error('surface has no plans'));
  }

  return ok(surface);
};

export const validatePlan = (plan: ContinuityReadinessCandidatePlan): Result<ContinuityReadinessCandidatePlan, Error> => {
  if (plan.tags.length === 0) {
    return fail(new Error('plan tags required'));
  }
  if (plan.score < 0 || plan.score > 100) {
    return fail(new Error('plan score out of range'));
  }
  if (plan.runbook.length === 0) {
    return fail(new Error('runbook missing'));
  }
  if (!plan.createdBy || plan.createdBy.length < 3) {
    return fail(new Error('createdBy invalid'));
  }
  return ok(plan);
};

export const validateEnvelope = (
  envelope: ContinuityReadinessEnvelope,
  context: ContinuityReadinessValidationContext,
): Result<ContinuityReadinessEnvelope, Error> => {
  if (!envelope.tenantId) {
    return fail(new Error('tenant required'));
  }

  if (envelope.surface.signals.length < context.minSignalCoverage) {
    return fail(new Error('insufficient signals'));
  }

  if (envelope.surface.plans.length < context.minPlanCount) {
    return fail(new Error('insufficient plans'));
  }

  for (const plan of envelope.surface.plans) {
    const validatedPlan = validatePlan(plan);
    if (!validatedPlan.ok) {
      return fail(validatedPlan.error);
    }
  }

  const normalizedTenant = ContinuityReadinessIds.tenant(envelope.tenantId);
  const normalizedSurfaceId = ContinuityReadinessIds.surface(envelope.surface.id);
  const fallbackRun: ContinuityReadinessRun = {
    id: ContinuityReadinessIds.run(`${envelope.tenantId}:fallback-run`),
    surfaceId: envelope.surface.id,
    tenantId: envelope.tenantId,
    planId: envelope.surface.plans[0]?.id ?? ContinuityReadinessIds.plan(`${envelope.tenantId}:fallback-plan`),
    phase: envelope.surface.plans[0]?.phase ?? 'observe',
    startedAt: envelope.surface.lastUpdated,
    startedBy: 'readiness-validator',
    expectedFinishAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    currentScore: envelope.coverage.length ? envelope.coverage.reduce((sum, item) => sum + item.score, 0) / envelope.coverage.length : 50,
    riskBand: envelope.coverage.some((entry) => entry.riskBand === 'critical') ? 'high' : envelope.surface.signals.length > 3 ? 'medium' : 'low',
    active: true,
    metadata: {},
  };

  const normalizedRun = envelope.run ? {
    ...envelope.run,
    id: ContinuityReadinessIds.run(envelope.run.id),
  } : fallbackRun;

  return ok({
    ...envelope,
    tenantId: normalizedTenant,
    surface: {
      ...envelope.surface,
      id: normalizedSurfaceId,
    },
    run: normalizedRun,
  });
};

export const validateTenantId = (value: string): boolean => typeof value === 'string' && value.length > 0;
