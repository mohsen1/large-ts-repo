import { z } from 'zod';

export const commandPhaseSchema = z.enum(['observe', 'stabilize', 'validate', 'scale', 'handoff']);
export const riskSchema = z.enum(['low', 'medium', 'high', 'critical']);
export const constraintTierSchema = z.enum(['hard', 'guardrail', 'advisory']);

const commandSignalSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  phase: commandPhaseSchema,
  confidence: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  labels: z.array(z.string()),
  metadata: z.record(z.unknown()),
});

const dependencySchema = z.object({
  dependsOnStepId: z.string().min(1),
  kind: z.enum(['must-run-before', 'can-run-with', 'block-until-verified']),
  rationale: z.string().min(1),
});

const stepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phase: commandPhaseSchema,
  commandTemplate: z.string().min(1),
  owner: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  slaMinutes: z.number().int().positive(),
  criticality: riskSchema,
  dependencies: z.array(dependencySchema),
  tags: z.array(z.string()),
  runbookRefs: z.array(z.string()),
});

const waveSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  name: z.string().min(1),
  steps: z.array(stepSchema).nonempty(),
  expectedDurationMinutes: z.number().int().positive(),
  parallelism: z.number().int().positive(),
  ownerTeam: z.string().min(1),
  isCritical: z.boolean(),
});

export const planProfileSchema = z.object({
  id: z.string().min(1),
  surfaceId: z.string().min(1),
  intent: z.enum(['containment', 'recovery', 'mitigation', 'prevention']),
  objectiveSummary: z.string().min(1),
  priority: z.number().int().positive(),
  riskLevel: riskSchema,
  waves: z.array(waveSchema).nonempty(),
  createdAt: z.string().datetime(),
  owner: z.string().min(1),
  tenant: z.string().min(1),
  labels: z.array(z.string()),
});

const windowSchema = z.object({
  id: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
  timezone: z.string().min(1),
  blackoutWindows: z.array(z.object({ from: z.string().datetime(), to: z.string().datetime() })),
  targetRecoveryMinutes: z.number().int().positive(),
});

export const commandSurfaceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  scenarioId: z.string().min(1),
  signals: z.array(commandSignalSchema),
  availablePlans: z.array(planProfileSchema),
  runtimeWindow: windowSchema,
  metadata: z.object({
    owner: z.string().min(1),
    region: z.string().min(1),
    runbookVersion: z.string().min(1),
    environment: z.enum(['prod', 'stage', 'dev']),
  }),
});

export const commandSelectionCriteriaSchema = z.object({
  preferredPhases: z.array(commandPhaseSchema),
  maxPlanMinutes: z.number().int().positive(),
  minConfidence: z.number().min(0).max(1),
  riskTolerance: riskSchema,
  mandatoryTags: z.array(z.string()),
});

export const commandCandidatePolicySchema = z.object({
  requiresApproval: z.boolean(),
  maxConcurrentCommands: z.number().int().positive(),
  maxRiskLevel: riskSchema,
});

export const commandSurfaceEnvelopeSchema = z.object({
  surface: commandSurfaceSchema,
  policy: commandCandidatePolicySchema,
  criteria: commandSelectionCriteriaSchema,
});
