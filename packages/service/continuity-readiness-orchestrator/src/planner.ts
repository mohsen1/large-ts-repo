import { ok, fail, type Result } from '@shared/result';
import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import {
  buildReadinessEnvelope,
  ContinuityReadinessIds,
  describePlanTrend,
  type ContinuityReadinessEnvelope,
  type ContinuityReadinessSignal,
  type ContinuityReadinessSurfaceId,
  type ContinuityReadinessTenantId,
  type ContinuityObjective,
  type ContinuityReadinessWorkspace,
} from '@domain/recovery-continuity-readiness';

export interface ContinuityReadinessPlanInput {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly tenantName: string;
  readonly surfaceId: ContinuityReadinessSurfaceId;
  readonly signals: readonly ContinuityReadinessSignal[];
  readonly objective: string;
  readonly horizonMinutes: number;
}

export interface ContinuityReadinessPlannerResult {
  readonly workspace: ContinuityReadinessWorkspace;
  readonly envelope: ContinuityReadinessEnvelope;
  readonly summary: string;
  readonly explanation: readonly string[];
  readonly candidateCount: number;
}

export interface ContinuityReadinessPlanner {
  (input: ContinuityReadinessPlanInput): Promise<Result<ContinuityReadinessPlannerResult, Error>>;
}

export const assembleReadinessPlan: ContinuityReadinessPlanner = async (input) => {
  const objective: ContinuityObjective = {
    id: withBrand(`objective:${input.tenantId}:core`, 'ContinuityObjectiveId'),
    tenantId: input.tenantId,
    targetRtoMinutes: 15,
    targetRpoMinutes: 5,
    slaName: input.objective,
    criticality: 'high',
    owners: ['continuity-team', 'ops'],
  };

  const built = buildReadinessEnvelope({
    tenantId: input.tenantId,
    surfaceId: input.surfaceId,
    tenantName: input.tenantName,
    signals: input.signals,
    objectives: [objective],
    horizonMinutes: input.horizonMinutes,
  });

  if (!built.ok) {
    return fail(built.error);
  }

  const topPlan = built.value.envelope.surface.plans[0];
  const explanation = topPlan ? [describePlanTrend(topPlan)] : ['no plan'];

  const workspace: ContinuityReadinessWorkspace = {
    tenantId: built.value.envelope.tenantId,
    tenantName: input.tenantName,
    selectedPlanId: topPlan?.id ?? ContinuityReadinessIds.plan(`fallback-${randomUUID()}`),
    projection: built.value.envelope.projection,
    coverage: built.value.envelope.coverage,
  };

  return ok({
    workspace,
    envelope: built.value.envelope,
    summary: built.value.summary,
    explanation,
    candidateCount: built.value.envelope.surface.plans.length,
  });
};
