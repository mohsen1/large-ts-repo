import { z } from 'zod';
import type {
  DrillPriority,
  DrillRunStatus,
  DrillStepStatus,
  StepFamily,
  DrillRunSnapshot,
  DrillWorkspace,
  DrillScenario,
  DrillMetricPoint,
  DrillRunStep,
  DrillChecklistItem,
  DrillLabRunId,
  DrillWorkspaceId,
  DrillScenarioId,
  ChecklistItemId,
  StepExecutionId,
} from './types';

const isoDate = z.string().datetime();

const runStatusSchema = z.union([
  z.literal('queued'),
  z.literal('preparing'),
  z.literal('running'),
  z.literal('paused'),
  z.literal('completed'),
  z.literal('failed'),
]);

const stepStatusSchema = z.union([
  z.literal('pending'),
  z.literal('active'),
  z.literal('succeeded'),
  z.literal('warning'),
  z.literal('failed'),
]);

const prioritySchema = z.union([
  z.literal('critical'),
  z.literal('high'),
  z.literal('medium'),
  z.literal('low'),
]);

const stepFamilySchema = z.union([
  z.literal('containment'),
  z.literal('mitigation'),
  z.literal('validation'),
  z.literal('restore'),
  z.literal('cleanup'),
]);

const checklistId = z.string().transform((value) => value as ChecklistItemId);
const runIdSchema = z.string().transform((value) => value as DrillLabRunId);
const workspaceIdSchema = z.string().transform((value) => value as DrillWorkspaceId);
const scenarioIdSchema = z.string().transform((value) => value as DrillScenarioId);
const stepIdSchema = z.string().transform((value) => value as StepExecutionId);

export const drillMetricPointSchema: z.ZodType<DrillMetricPoint> = z
  .object({
    timestamp: isoDate,
    metric: z.string().min(1),
    value: z.number().finite(),
    unit: z.string().optional(),
    tags: z.record(z.string(), z.string()).optional(),
  }) as unknown as z.ZodType<DrillMetricPoint>;

export const drillStepSchema: z.ZodType<DrillRunStep> = z
  .object({
    id: stepIdSchema,
    runId: runIdSchema,
    order: z.number().int().nonnegative(),
    family: stepFamilySchema,
    name: z.string().min(1),
    owner: z.string().min(1),
    status: stepStatusSchema,
    startedAt: isoDate.optional(),
    finishedAt: isoDate.optional(),
    evidence: z.array(z.string()).optional(),
    checkpoints: z.array(drillMetricPointSchema),
    metadata: z.record(z.string(), z.unknown()),
  }) as unknown as z.ZodType<DrillRunStep>;

export const drillSnapshotSchema: z.ZodType<DrillRunSnapshot> = z
  .object({
    id: runIdSchema,
    workspaceId: workspaceIdSchema,
    scenarioId: scenarioIdSchema,
    scenarioName: z.string().min(1),
    status: runStatusSchema,
    startedAt: isoDate.optional(),
    updatedAt: isoDate,
    completedAt: isoDate.optional(),
    priority: prioritySchema,
    riskBudgetPercent: z.number().min(0).max(1),
    steps: z.array(drillStepSchema),
    signals: z.array(
      z.object({
        name: z.string().min(1),
        source: z.union([z.literal('incident'), z.literal('slo'), z.literal('capacity'), z.literal('policy')]),
        confidence: z.number().min(0).max(1),
        severity: prioritySchema,
        detectedAt: isoDate,
        metric: drillMetricPointSchema.optional(),
      }),
    ),
    metadata: z.record(z.string(), z.unknown()),
  }) as unknown as z.ZodType<DrillRunSnapshot>;

export const scenarioSchema: z.ZodType<DrillScenario> = z
  .object({
    id: scenarioIdSchema,
    workspaceId: workspaceIdSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    blastRadius: z.union([z.literal('regional'), z.literal('global')]),
    steps: z.array(
      z.object({
        id: checklistId,
        step: z.string().min(1),
        family: stepFamilySchema,
        prerequisites: z.array(checklistId),
        slaMinutes: z.number().int().positive(),
        estimatedMinutes: z.number().min(1),
        runbookRef: z.string().optional(),
      }),
    ) as unknown as z.ZodType<DrillChecklistItem[]>,
    tags: z.array(z.string()),
    objectives: z.array(z.string().min(1)),
  }) as unknown as z.ZodType<DrillScenario>;

export const scenarioChecklistSchema: z.ZodType<readonly DrillChecklistItem[]> = z
  .array(
    z.object({
      id: checklistId,
      step: z.string().min(1),
      family: stepFamilySchema,
      prerequisites: z.array(checklistId),
      slaMinutes: z.number().int().positive(),
      estimatedMinutes: z.number().min(1),
      runbookRef: z.string().optional(),
    }),
  ) as unknown as z.ZodType<readonly DrillChecklistItem[]>;

export const workspaceSchema: z.ZodType<DrillWorkspace> = z
  .object({
    id: workspaceIdSchema,
    scenarioIds: z.array(scenarioIdSchema),
    name: z.string().min(1),
    description: z.string().min(1),
    metadata: z.object({
      tenant: z.string().min(1),
      environment: z.union([z.literal('dev'), z.literal('staging'), z.literal('prod')]),
      ownerTeam: z.string().min(1),
      createdBy: z.string().min(1),
      tags: z.array(z.string()),
      labels: z.record(z.string(), z.string()).optional(),
    }),
    createdAt: isoDate,
    updatedAt: isoDate,
  }) as unknown as z.ZodType<DrillWorkspace>;

export const parseSnapshot = (value: unknown): DrillRunSnapshot => drillSnapshotSchema.parse(value);
export const parseWorkspace = (value: unknown): DrillWorkspace => workspaceSchema.parse(value);
export const parseScenario = (value: unknown): DrillScenario => scenarioSchema.parse(value);
