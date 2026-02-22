import { z } from 'zod';
import type { ContinuityPriority, ContinuityRiskLevel, ContinuityState } from './types';

const dependencyTypeSchema = z.object({
  dependsOn: z.string().min(1),
  type: z.enum(['service', 'artifact', 'network']),
  criticality: z.enum(['low', 'medium', 'high', 'critical'] as const),
});

const continuityTaskSchema = z.object({
  artifactId: z.string().min(1),
  title: z.string().min(1),
  command: z.string().min(1),
  region: z.string().min(1),
  dependencies: z.array(dependencyTypeSchema),
  estimatedLatencyMs: z.number().nonnegative(),
  recoveryTimeObjectiveMinutes: z.number().positive(),
  risk: z.enum(['low', 'medium', 'high', 'critical'] as const),
  tags: z.array(z.string()),
});

const numericBrand = z.string().min(1);

export const continuityPlanSchema = z.object({
  id: numericBrand,
  tenantId: numericBrand,
  displayName: z.string().min(1),
  summary: z.string().min(1),
  ownerTeam: z.string().min(1),
  region: z.string().min(1),
  priority: z.enum(['bronze', 'silver', 'gold', 'platinum', 'critical'] as const) as z.ZodType<ContinuityPriority>,
  priorityWeight: z.number().min(0).max(1),
  tasks: z.array(continuityTaskSchema),
  slaMinutes: z.number().positive(),
  maxConcurrentTasks: z.number().int().positive(),
  enabled: z.boolean(),
  expectedDependencies: z.array(dependencyTypeSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const runState = z.enum([
  'draft',
  'validated',
  'ready',
  'scheduled',
  'running',
  'completed',
  'interrupted',
  'canceled',
]) as z.ZodType<ContinuityState>;

export const continuityRunInputSchema = z.object({
  runId: numericBrand,
  tenantId: numericBrand,
  planId: numericBrand,
  requestedWindow: z.object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    tz: z.string().min(1),
  }),
  targetServices: z.array(z.string()),
  dryRun: z.boolean(),
  createdAt: z.string().datetime(),
});

export const continuityRunStepSchema = z.object({
  taskId: numericBrand,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  status: z.enum(['pending', 'running', 'done', 'failed', 'skipped']),
  retryCount: z.number().int().min(0),
});

export const continuityRunContextSchema = z.object({
  runId: numericBrand,
  state: runState,
  tenantId: numericBrand,
  planId: numericBrand,
  steps: z.array(continuityRunStepSchema),
  startedAt: z.string().datetime(),
  deadlineAt: z.string().datetime(),
  trace: z.array(z.string()),
});

export const continuityDecisionSchema = z.object({
  tenantId: numericBrand,
  runId: numericBrand,
  eventType: z.string().min(1),
  payload: z.unknown(),
  emittedAt: z.string().datetime(),
});

export const continuityRiskSchema = z.object({
  factor: z.enum(['low', 'medium', 'high', 'critical'] as const) as z.ZodType<ContinuityRiskLevel>,
  weight: z.number().min(0).max(1),
  explanation: z.string().min(3),
});

export const continuityScorecardSchema = z.object({
  risk: continuityRiskSchema,
  score: z.number(),
  runState: runState,
  confidence: z.number().min(0).max(1),
});

export type ContinuityScorecard = z.infer<typeof continuityScorecardSchema>;
export type ContinuityRunContextInput = z.infer<typeof continuityRunContextSchema>;
