import { z } from 'zod';
import type { Merge, NonEmptyArray } from '@shared/type-level';
import {
  type ActionCandidate,
  type RecoveryActionPlan,
  type RecoverySimulationResult,
  type RecoverySignalInput,
  type ScenarioId,
  type ScenarioPolicy,
  type ScenarioPolicy as Policy,
  type ScenarioWindowState,
} from './models';
import { summarizeSignals } from './signals';
import { evaluatePolicyConstraints, type ConstraintContext } from './constraints';

const planSchema = z.object({
  scenarioId: z.string(),
  tenantId: z.string(),
  sequence: z.array(z.any()).min(1),
  estimatedCompletionMinutes: z.number().nonnegative(),
  aggregateConfidence: z.number().min(0).max(1),
  rationale: z.string(),
  window: z.object({
    windowId: z.string(),
    startUtc: z.string(),
    endUtc: z.string(),
    region: z.string(),
    ownerTeam: z.string(),
  }),
  createdAtUtc: z.string(),
});

export interface PlanInput {
  readonly scenarioId: ScenarioId;
  readonly tenantId: string;
  readonly policy: ScenarioPolicy;
  readonly signals: readonly RecoverySignalInput[];
  readonly candidates: readonly ActionCandidate[];
  readonly context: ConstraintContext;
}

export interface PlanOutput {
  readonly scenarioId: ScenarioId;
  readonly status: ScenarioWindowState;
  readonly simulation: RecoverySimulationResult;
  readonly violations: readonly string[];
}

export const buildRecoveryPlan = (input: PlanInput): RecoveryActionPlan => {
  const ordered = [...input.candidates].sort((left, right) => left.estimatedMinutes - right.estimatedMinutes);
  const plan = {
    planId: `${input.scenarioId}-plan` as any,
    scenarioId: input.scenarioId,
    sequence: ordered as NonEmptyArray<ActionCandidate>,
    estimatedCompletionMinutes: ordered.reduce((sum, action) => sum + action.estimatedMinutes, 0),
    aggregateConfidence: Math.min(0.99, ordered.length === 0 ? 0 : 1 - ordered.length * 0.03),
    rationale: buildRationale(input.signals, ordered),
    window: {
      windowId: `${input.scenarioId}-window` as any,
      startUtc: new Date().toISOString(),
      endUtc: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      region: input.signals[0]?.fingerprint.attributes['region'] as string ?? 'global',
      ownerTeam: input.policy.tenantId === (input.tenantId as any) ? 'ops' : 'platform',
    },
    createdAtUtc: new Date().toISOString(),
  };

  const parsed = planSchema.safeParse(plan);
  if (!parsed.success) {
    throw new Error('plan-validation-failed');
  }

  return parsed.data as unknown as RecoveryActionPlan;
};

export const planSimulation = (input: PlanInput): PlanOutput => {
  const summary = summarizeSignals(input.signals);
  const policyEvaluation = evaluatePolicyConstraints({
    plan: buildRecoveryPlan(input),
    context: input.context,
    constraints: input.policy.constraints,
  });

  const simulation: RecoverySimulationResult = {
    scenarioId: input.scenarioId,
    tenantId: input.tenantId as any,
    actionPlan: buildRecoveryPlan(input),
    finalRiskScore: Math.max(0, 1 - summary.averageConfidence - summary.peakSeverity.length / 10),
    windowState: policyEvaluation.windowState,
    notes: [
      `signals=${summary.signalCount}`,
      `entities=${summary.uniqueEntities}`,
      `peak=${summary.peakSeverity}`,
      `window=${policyEvaluation.windowState}`,
    ],
  };

  return {
    scenarioId: input.scenarioId,
    status: policyEvaluation.windowState,
    simulation,
    violations: policyEvaluation.violations.map((entry) => `${entry.constraint}:${entry.detail}`),
  };
};

export type EnrichedPlan = Merge<PlanOutput, { readonly policyUsed: Policy }>;

const buildRationale = (signals: readonly RecoverySignalInput[], actions: readonly ActionCandidate[]): string => {
  const bySource = new Set(signals.map((signal) => signal.fingerprint.source));
  return `Recover ${signals.length} signals via ${actions.length} actions across ${Array.from(bySource).join(', ')}`;
};
