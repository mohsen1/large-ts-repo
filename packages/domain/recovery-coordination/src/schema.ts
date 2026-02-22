import { z } from 'zod';
import type {
  CandidateScorer,
  CandidateScorer as _CandidateScorer,
  CoordinationBudget,
  CoordinationConstraint,
  CoordinationCorrelationId,
  CoordinationId,
  CoordinationPhase,
  CoordinationPlanCandidate,
  CoordinationProgram,
  CoordinationRunId,
  CoordinationSelectionResult,
  CoordinationTenant,
  CoordinationWindow,
  CoordinationScope,
} from './types';

const isoDate = z.string().datetime();
const nonEmpty = z.string().trim().min(1);

export const coordinationWindowSchema = z.object({
  from: isoDate,
  to: isoDate,
  timezone: nonEmpty.default('UTC'),
});

export const coordinationScopeSchema = z.enum([
  'incident',
  'maintenance',
  'security',
  'capacity',
]);

export const coordinationPhaseSchema = z.enum([
  'discover',
  'plan',
  'execute',
  'observe',
  'close',
]);

export const coordinationPrioritySchema = z.enum([
  'bronze',
  'silver',
  'gold',
  'platinum',
]);

export const coordinationConstraintSchema = z.object({
  id: nonEmpty,
  kind: z.enum(['dependency', 'parallelism', 'region', 'tenant', 'change-freeze']),
  weight: z.number().min(0).max(1),
  scope: coordinationScopeSchema,
  affectedStepIds: z.array(nonEmpty),
  details: z.string(),
  tags: z.array(z.string()),
  boundary: z
    .object({
      minWeight: z.number().min(0),
      maxWeight: z.number().min(0),
      softLimit: z.number().min(0),
      hardLimit: z.number().min(0),
    })
    .optional(),
});

export const coordinationStepSchema = z.object({
  id: nonEmpty,
  command: z.string().min(1),
  title: z.string().min(1),
  priority: coordinationPrioritySchema,
  durationSeconds: z.number().int().min(1),
  requires: z.array(z.string()),
  optionalFallbackIds: z.array(z.string()),
  criticality: z.number().min(0),
  tags: z.array(z.string()),
});

export const coordinationProgramSchema = z.object({
  id: nonEmpty,
  tenant: nonEmpty,
  incidentId: nonEmpty,
  scope: coordinationScopeSchema,
  runWindow: coordinationWindowSchema,
  phase: coordinationPhaseSchema,
  requestedBy: nonEmpty,
  correlationId: nonEmpty,
  rawProgram: z.record(z.unknown()),
  steps: z.array(coordinationStepSchema),
  constraints: z.array(coordinationConstraintSchema),
  createdAt: isoDate,
});

export const coordinationPlanCandidateSchema = z.object({
  id: nonEmpty,
  correlationId: nonEmpty,
  programId: nonEmpty,
  runId: nonEmpty,
  tenant: nonEmpty,
  steps: z.array(coordinationStepSchema),
  sequence: z.array(nonEmpty),
  metadata: z.object({
    parallelism: z.number().int().min(0),
    expectedCompletionMinutes: z.number().min(0),
    riskIndex: z.number().min(0).max(1),
    resilienceScore: z.number().min(0).max(1),
  }),
  createdBy: nonEmpty,
  createdAt: isoDate,
});

export const budgetSchema = z.object({
  maxStepCount: z.number().int().min(1),
  maxParallelism: z.number().int().min(1),
  maxRuntimeMinutes: z.number().min(1),
  maxCriticality: z.number().min(0).max(100),
});

export const selectionResultSchema = z.object({
  runId: nonEmpty,
  selectedCandidate: coordinationPlanCandidateSchema,
  alternatives: z.array(coordinationPlanCandidateSchema),
  decision: z.enum(['approved', 'deferred', 'blocked']),
  blockedConstraints: z.array(z.string()),
  reasons: z.array(z.string()),
  selectedAt: isoDate,
});

export const parseProgram = (value: unknown): CoordinationProgram => {
  return coordinationProgramSchema.parse(value) as unknown as CoordinationProgram;
};

export const parseCandidate = (value: unknown): CoordinationPlanCandidate => {
  return coordinationPlanCandidateSchema.parse(value) as unknown as CoordinationPlanCandidate;
};

export const parseSelection = (value: unknown): CoordinationSelectionResult => {
  return selectionResultSchema.parse(value) as unknown as CoordinationSelectionResult;
};

export const parseWindow = (value: unknown): CoordinationWindow => {
  return coordinationWindowSchema.parse(value);
};

export const asTenant = (value: unknown): CoordinationTenant => {
  return nonEmpty.parse(value) as CoordinationTenant;
};

export const asCorrelation = (value: unknown): CoordinationCorrelationId => {
  return nonEmpty.parse(value) as CoordinationCorrelationId;
};

export const asRun = (value: unknown): CoordinationRunId => {
  return nonEmpty.parse(value) as CoordinationRunId;
};

export const asProgramId = (value: unknown): CoordinationId => {
  return nonEmpty.parse(value) as CoordinationId;
};

export const asBudget = (value: unknown): CoordinationBudget => {
  return budgetSchema.parse(value);
};

export const defaultScorer = ((candidate: CoordinationPlanCandidate): number => {
  const durationPenalty = candidate.metadata.expectedCompletionMinutes;
  const riskPenalty = candidate.metadata.riskIndex * 100;
  const criticalityPenalty = candidate.steps.reduce((sum, step) => sum + step.criticality, 0);
  return candidate.metadata.parallelism * 10 - durationPenalty - riskPenalty - criticalityPenalty;
}) as CandidateScorer;

const asCandidateScorer = (value: unknown): _CandidateScorer | undefined => {
  if (typeof value === 'function') {
    return value as _CandidateScorer;
  }
  return undefined;
};

export const parseScorer = (value: unknown): _CandidateScorer => {
  return asCandidateScorer(value) ?? defaultScorer;
};
