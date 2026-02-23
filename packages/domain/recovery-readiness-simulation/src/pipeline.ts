import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import {
  type SimulationPlanInput,
  type SimulationPlanEnvelope,
  type SimulationPolicyViolation,
  type SimulationStatus,
} from './types';
import { buildPlan } from './engine';
import { validatePlanConstraints } from './constraints-engine';
import { summarizePlan, deriveHeatMap, evaluateConstraintFit } from './plan-analytics';
import { buildStabilityMatrix, scoreFromMatrix } from './stability-matrix';
import { defaultPolicyEnvelope } from './adapters';

export interface PipelineContext {
  readonly tenant: string;
  readonly requestedBy: string;
  readonly mode: 'strict' | 'balanced' | 'aggressive';
}

export interface PipelineResult {
  readonly tenant: string;
  readonly runId: string;
  readonly status: SimulationStatus;
  readonly planEnvelope: SimulationPlanEnvelope;
  readonly policyEnvelope: ReturnType<typeof defaultPolicyEnvelope>;
  readonly heatMapPoints: ReturnType<typeof deriveHeatMap>;
  readonly riskScore: number;
  readonly policyViolations: readonly SimulationPolicyViolation[];
}

const finalizeStatus = (status: SimulationPlanEnvelope['plan']['summary']['status']): SimulationStatus =>
  status === 'complete' ? 'complete' : status === 'running' ? 'running' : 'pending';

export const executeReadinessSimulation = (
  input: SimulationPlanInput,
  context: PipelineContext,
): Result<PipelineResult, Error> => {
  const constraintDecision = validatePlanConstraints(input, context.mode);
  if (!constraintDecision.ok) {
    return fail(constraintDecision.error);
  }

  const planResult = buildPlan({
    ...input,
    constraints: constraintDecision.value.envelope.normalized,
  });
  if (!planResult.ok) return fail(planResult.error);

  const summary = summarizePlan(planResult.value.plan);
  if (!summary.ok) return fail(summary.error);
  const matrix = buildStabilityMatrix(planResult.value.plan.summary, constraintDecision.value.envelope.normalized);
  const fit = evaluateConstraintFit(constraintDecision.value.envelope.normalized, planResult.value.plan.summary);

  const heatMapPoints = deriveHeatMap(planResult.value.plan);
  const policyEnvelope = defaultPolicyEnvelope(
    {
      tenant: context.tenant,
      draft: input.draft,
      policy: input.policy,
      signals: input.signals,
      runId: input.runId,
      constraints: constraintDecision.value.envelope.normalized,
      seed: planResult.value.plan.seed,
    },
    constraintDecision.value.envelope.normalized,
  );

  return ok({
    tenant: context.tenant,
    runId: input.runId,
    status: finalizeStatus(planResult.value.plan.summary.status),
    planEnvelope: planResult.value,
    policyEnvelope,
    heatMapPoints,
    riskScore: scoreFromMatrix(matrix),
    policyViolations: fit.violations,
  });
};
