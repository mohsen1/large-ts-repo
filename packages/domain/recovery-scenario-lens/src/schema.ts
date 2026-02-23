import { z } from 'zod';

const percentSchema = z.number().min(0).max(1);
const timelinePointSchema = z.object({
  timestamp: z.string().datetime(),
  atMs: z.number().int().nonnegative(),
  value: z.number(),
});

export const scenarioCommandSchema = z.object({
  commandId: z.string().min(1),
  commandName: z.string().min(1),
  targetService: z.string().min(1),
  estimatedDurationMs: z.number().positive(),
  resourceSpendUnits: z.number().int().nonnegative(),
  prerequisites: z.array(z.string()),
  blastRadius: z.number().int().min(0).max(5),
});

export const scenarioLinkSchema = z.object({
  from: z.string(),
  to: z.string(),
  reason: z.string(),
  coupling: z.number().min(0).max(1),
});

export const scenarioBlueprintSchema = z.object({
  scenarioId: z.string(),
  incidentId: z.string(),
  name: z.string(),
  windowMinutes: z.number().positive(),
  baselineConfidence: percentSchema,
  signals: z.array(z.object({
    signalId: z.string(),
    name: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    score: percentSchema,
    observedAt: z.string(),
    context: z.record(z.string()),
    source: z.enum(['telemetry', 'manual', 'simulation']),
  })),
  commands: z.array(scenarioCommandSchema),
  links: z.array(scenarioLinkSchema),
  policies: z.array(z.string()),
});

export const scenarioConstraintSchema = z.object({
  constraintId: z.string(),
  type: z.enum(['max_parallelism', 'max_blast', 'must_complete_before', 'region_gate']),
  description: z.string(),
  severity: z.enum(['warning', 'error']),
  commandIds: z.array(z.string()),
  limit: z.number(),
});

export const scenarioPlanSchema = z.object({
  planId: z.string(),
  blueprintId: z.string(),
  version: z.number().int().nonnegative(),
  commandIds: z.array(z.string()),
  createdAt: z.string(),
  expectedFinishMs: z.number().int().nonnegative(),
  score: z.number(),
  constraints: z.array(scenarioConstraintSchema),
  warnings: z.array(z.string()),
});

export const scenarioReadModelSchema = z.object({
  scenarioId: z.string(),
  generatedAt: z.string(),
  metadata: z.record(z.unknown()),
  blueprint: scenarioBlueprintSchema,
  candidates: z.array(z.object({
    candidateId: z.string(),
    blueprintId: z.string(),
    orderedCommandIds: z.array(z.string()),
    windows: z.array(z.object({
      startAt: z.string(),
      endAt: z.string(),
      commandIds: z.array(z.string()),
      concurrency: z.number().int().nonnegative(),
    })),
    score: z.number(),
    risk: z.number(),
    resourceUse: z.number().nonnegative(),
  })),
  activePlan: scenarioPlanSchema.optional(),
});

export type ScenarioBlueprintShape = z.infer<typeof scenarioBlueprintSchema>;
export type ScenarioReadModelShape = z.infer<typeof scenarioReadModelSchema>;
export type ScenarioPlanShape = z.infer<typeof scenarioPlanSchema>;
