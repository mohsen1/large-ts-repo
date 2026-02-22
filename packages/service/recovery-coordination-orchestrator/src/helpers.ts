import type {
  CoordinationPlanCandidate,
  CoordinationProgram,
  CoordinationStep,
  CoordinationTenant,
  CoordinationWindow,
} from '@domain/recovery-coordination';
import type { RecoveryProgram, RecoveryRunState } from '@domain/recovery-orchestration';
import { buildPlanBlueprint, type RecoveryPlanCandidate } from '@domain/recovery-plan';
import type { CoordinationCommandContext } from './types';

export interface CreateCoordinationInput {
  readonly rawProgram: RecoveryProgram;
  readonly context: CoordinationCommandContext;
}

export interface CandidateBuildInput {
  readonly programId: CoordinationProgram['id'];
  readonly runId: string;
  readonly tenant: CoordinationTenant;
  readonly correlationId: string;
  readonly candidateId: string;
  readonly sequence: readonly string[];
  readonly budget: {
    maxStepCount: number;
    maxParallelism: number;
    maxRuntimeMinutes: number;
    maxCriticality: number;
  };
  readonly createdBy: string;
  readonly riskSignals: readonly string[];
  readonly policySignals: readonly string[];
  readonly steps: readonly CoordinationStep[];
  readonly plan: ReturnType<typeof buildPlanBlueprint>;
}

export const createCoordinationProgram = (
  rawProgram: RecoveryProgram,
  context: CoordinationCommandContext,
): CoordinationProgram => ({
  id: rawProgram.id as CoordinationProgram['id'],
  tenant: `${context.tenant}` as CoordinationProgram['tenant'],
  incidentId: rawProgram.id,
  scope: 'incident',
  runWindow: makeWindow(),
  phase: 'discover',
  requestedBy: context.requestedBy,
  correlationId: `${context.correlationId}` as never,
  rawProgram,
  steps: rawProgram.steps.map((step, index) => ({
    id: step.id,
    command: step.command,
    title: step.title,
    priority: ['bronze', 'silver', 'gold', 'platinum'][index % 4] as never,
    durationSeconds: (step.requiredApprovals + 1) * 90,
    requires: step.dependsOn,
    optionalFallbackIds: [],
    criticality: step.command.length % 100,
    tags: ['recovery', rawProgram.mode],
  })),
  constraints: rawProgram.constraints.map((constraint, index) => ({
    id: `${context.correlationId}:constraint:${index}` as never,
    kind: index % 2 === 0 ? 'dependency' : 'parallelism',
    weight: Math.min(1, 0.25 + index * 0.08),
    scope: index % 3 === 0 ? 'incident' : index % 3 === 1 ? 'tenant' : 'capacity',
    affectedStepIds: rawProgram.steps.map((step) => step.id),
    details: constraint.description,
    tags: ['rule', 'coordination'],
    boundary: {
      minWeight: 0.05,
      maxWeight: 1,
      softLimit: 0.8,
      hardLimit: 1,
    },
  })),
  createdAt: new Date().toISOString(),
});

export const createCandidate = (input: CandidateBuildInput): CoordinationPlanCandidate => ({
  id: input.candidateId,
  correlationId: input.correlationId as never,
  programId: input.programId,
  runId: input.runId as never,
  tenant: input.tenant,
  steps: [...input.steps],
  sequence: [...input.sequence],
  metadata: {
    parallelism: Math.min(
      input.budget.maxParallelism,
      Math.max(1, input.sequence.length),
    ),
    expectedCompletionMinutes: Math.max(
      10,
      input.steps.length * 4 * (1 + (input.sequence.length ? 0 : 1)),
    ),
    riskIndex: Math.min(1, Math.max(0, input.riskSignals.length / Math.max(input.sequence.length, 1) / 2)),
    resilienceScore: Math.max(
      0,
      1 - (input.policySignals.length * 0.05) - (input.budget.maxStepCount ? 0.02 : 0),
    ),
  },
  createdBy: input.createdBy,
  createdAt: new Date().toISOString(),
});

const makeWindow = (): CoordinationWindow => ({
  from: new Date().toISOString(),
  to: new Date(Date.now() + 3600_000).toISOString(),
  timezone: 'UTC',
});
