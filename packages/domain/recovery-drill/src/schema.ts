import { z } from 'zod';

import type {
  DrillConstraint,
  DrillMode,
  DrillPriority,
  DrillQuery,
  DrillRunContext,
  DrillStatus,
  DrillTemplate,
  DrillWindow,
} from './types';
import type {
  RecoveryDrillRunId,
  RecoveryDrillTemplateId,
  RecoveryDrillTenantId,
} from './types';

const nonEmptyString = z.string().min(1);

export const DrillWindowSchema: z.ZodType<DrillWindow> = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().min(1),
});

const ConstraintSchema: z.ZodType<DrillConstraint> = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  targetService: z.string().min(1),
  thresholdPct: z.number().min(0).max(100),
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'range']),
});

const StepSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  command: nonEmptyString,
  targetServices: z.array(nonEmptyString),
  expectedSeconds: z.number().nonnegative(),
  rollback: z.string().optional(),
  requiredApprovals: z.number().int().nonnegative(),
  constraints: z.array(ConstraintSchema),
});

const ScenarioSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  summary: nonEmptyString,
  objective: nonEmptyString,
  impact: z.enum(['low', 'medium', 'high', 'critical']),
  recoveryImpactScore: z.number().int().min(1).max(100),
  steps: z.array(StepSchema),
  prerequisites: z.array(nonEmptyString),
  owners: z.array(nonEmptyString),
});

const TemplateInputSchema = z.object({
  id: nonEmptyString,
  tenantId: nonEmptyString,
  service: nonEmptyString,
  title: nonEmptyString,
  mode: z.enum(['tabletop', 'game-day', 'automated-chaos', 'customer-sim']),
  priority: z.enum(['bronze', 'silver', 'gold', 'platinum', 'critical']),
  window: DrillWindowSchema,
  scenarios: z.array(ScenarioSchema),
  defaultApprovals: z.number().int().nonnegative(),
  createdBy: nonEmptyString,
  tags: z.record(nonEmptyString),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const RunContextSchema = z.object({
  runId: nonEmptyString,
  templateId: nonEmptyString,
  runAt: z.string().datetime(),
  initiatedBy: nonEmptyString,
  mode: z.enum(['tabletop', 'game-day', 'automated-chaos', 'customer-sim']),
  approvals: z.number().int().nonnegative(),
});

const DrillStatusSchema = z.enum([
  'planned',
  'queued',
  'running',
  'paused',
  'succeeded',
  'degraded',
  'failed',
  'cancelled',
]);

const QuerySchema = z.object({
  tenant: z.string().optional(),
  status: z.array(DrillStatusSchema).optional(),
  mode: z.enum(['tabletop', 'game-day', 'automated-chaos', 'customer-sim']).optional(),
  priority: z.enum(['bronze', 'silver', 'gold', 'platinum', 'critical']).optional(),
});

export const parseDrillTemplate = (value: unknown): DrillTemplate =>
  TemplateInputSchema.parse(value) as unknown as DrillTemplate & {
    id: RecoveryDrillTemplateId;
    tenantId: RecoveryDrillTenantId;
  };

export const parseDrillContext = (value: unknown): DrillRunContext =>
  RunContextSchema.parse(value) as unknown as DrillRunContext;

export const parseDrillQuery = (value: unknown): DrillQuery => QuerySchema.parse(value) as DrillQuery;

export const isDrillMode = (value: unknown): value is DrillMode =>
  z.string().safeParse(value).success && ['tabletop', 'game-day', 'automated-chaos', 'customer-sim'].includes(String(value));

export const isDrillStatus = (value: unknown): value is DrillStatus =>
  z.string().safeParse(value).success &&
  ['planned', 'queued', 'running', 'paused', 'succeeded', 'degraded', 'failed', 'cancelled'].includes(String(value));

export const normalizeMode = (mode: DrillMode): DrillMode => mode;
export const normalizeWindow = (window: DrillWindow): DrillWindow => ({
  startAt: window.startAt,
  endAt: window.endAt,
  timezone: window.timezone,
});
