import { z } from 'zod';

export const readinessSignalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  value: z.number().min(0).max(100),
  reliability: z.number().min(0).max(1),
  observedAt: z.string().datetime(),
  tags: z.array(z.string()).default([]),
});

export type PlaybookSignal = z.infer<typeof readinessSignalSchema>;

export const readinessPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export type ReadinessPriority = z.infer<typeof readinessPrioritySchema>;

export const playbookStepKindSchema = z.enum([
  'validate',
  'quarantine',
  'drain',
  'restore',
  'notify',
  'audit',
]);
export type PlaybookStepKind = z.infer<typeof playbookStepKindSchema>;

export const playbookConstraintSchema = z.object({
  key: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains']),
  value: z.union([z.string(), z.number(), z.boolean()]),
  rationale: z.string().min(1).max(512),
});
export type PlaybookConstraint = z.infer<typeof playbookConstraintSchema>;

export const playbookActionParamSchema = z.union([
  z.record(z.any()),
  z.array(z.unknown()),
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type PlaybookActionParam = z.infer<typeof playbookActionParamSchema>;

export const playbookStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().max(400),
  kind: playbookStepKindSchema,
  estimatedMinutes: z.number().int().min(1),
  automationEligible: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  requiredSignals: z.array(z.string()).default([]),
  constraints: z.array(playbookConstraintSchema).default([]),
  actionParams: z.record(playbookActionParamSchema).default({}),
});
export type PlaybookStep = z.infer<typeof playbookStepSchema>;

export const playbookDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['customer-impact', 'infrastructure', 'security', 'compliance', 'financial']),
  description: z.string().max(1500),
  ownerTeam: z.string().min(1),
  priority: readinessPrioritySchema,
  steps: z.array(playbookStepSchema).min(1),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().min(1),
});
export type PlaybookDefinition = z.infer<typeof playbookDefinitionSchema>;

export const runStatusSchema = z.enum(['draft', 'queued', 'running', 'blocked', 'degraded', 'completed', 'failed']);
export type ReadinessRunStatus = z.infer<typeof runStatusSchema>;

export const readinessStepExecutionSchema = z.object({
  stepId: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  status: runStatusSchema,
  operator: z.string().default('automated'),
  notes: z.string().max(1200).optional(),
});
export type ReadinessStepExecution = z.infer<typeof readinessStepExecutionSchema>;

export const readinessRunSchema = z.object({
  id: z.string().min(1),
  playbookId: z.string().min(1),
  triggeredBy: z.string().min(1),
  status: runStatusSchema,
  priority: readinessPrioritySchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  riskScore: z.number().min(0).max(1),
  signals: z.array(readinessSignalSchema),
  execution: z.array(readinessStepExecutionSchema),
  metadata: z.record(playbookActionParamSchema).default({}),
});
export type ReadinessRun = z.infer<typeof readinessRunSchema>;

export const readinessPlanWindowSchema = z.object({
  horizonHours: z.number().int().positive(),
  refreshCadenceMinutes: z.number().int().positive(),
  maxConcurrency: z.number().int().positive(),
  allowParallelRun: z.boolean().default(true),
  blackoutWindows: z
    .array(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        startHour: z.number().min(0).max(23),
        endHour: z.number().min(0).max(23),
      }),
    )
    .default([]),
});
export type ReadinessPlanWindow = z.infer<typeof readinessPlanWindowSchema>;

export interface ReadinessPlaybookTemplate {
  id: string;
  title: string;
  definition: ReadinessPlanWindow;
  playbook: PlaybookDefinition;
}

export interface ReadinessRunEnvelope {
  run: ReadinessRun;
  template: ReadinessPlaybookTemplate | null;
  context: Record<string, string | number | boolean | null>;
}

export const assertPlaybookSchema = (input: unknown) => playbookDefinitionSchema.parse(input);
export const assertRunSchema = (input: unknown) => readinessRunSchema.parse(input);

