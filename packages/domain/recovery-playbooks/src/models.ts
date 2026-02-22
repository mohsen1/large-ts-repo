import { z } from 'zod';
import type { Brand } from '@shared/type-level';
import type { DeepMerge } from '@shared/type-level';

export type RecoveryPlaybookId = Brand<string, 'RecoveryPlaybookId'>;
export type RecoveryStepId = Brand<string, 'RecoveryStepId'>;
export type RecoveryPlanId = Brand<string, 'RecoveryPlanId'>;

export type RecoveryPlaybookStatus = 'draft' | 'published' | 'deprecated' | 'retired';
export type StepType = 'automated' | 'manual' | 'human-gate' | 'safety-check';
export type ActionScope = 'region' | 'service' | 'tenant' | 'global';

export interface RecoveryObjective<TContext = Record<string, unknown>> {
  name: string;
  target: TContext;
  acceptedSlaMinutes: number;
  owner: string;
}

export interface PlaybookStepConstraint {
  key: string;
  value: string | number | boolean;
  operator: 'gte' | 'lte' | 'eq' | 'neq' | 'contains' | 'matches';
}

export interface PlaybookStepDependency {
  dependsOn: RecoveryStepId;
  condition?: string;
  optional: boolean;
}

export interface RecoveryStep<TAction = unknown> {
  id: RecoveryStepId;
  name: string;
  summary: string;
  type: StepType;
  rank: number;
  owner: string;
  action: TAction;
  scope: ActionScope;
  durationMinutes: number;
  retries: number;
  timeoutMinutes: number;
  constraints: readonly PlaybookStepConstraint[];
  dependencies: readonly PlaybookStepDependency[];
  metadata: Record<string, unknown>;
}

export interface PlaybookChannelWindow {
  channel: string;
  tz: string;
  fromHour: number;
  toHour: number;
}

export interface RecoveryPlaybookContext {
  tenantId: string;
  serviceId: string;
  incidentType: string;
  affectedRegions: readonly string[];
  triggeredBy: string;
}

export interface RecoveryPlaybook {
  id: RecoveryPlaybookId;
  title: string;
  status: RecoveryPlaybookStatus;
  category: string;
  labels: readonly string[];
  version: string;
  owner: string;
  steps: readonly RecoveryStep[];
  createdAt: string;
  updatedAt: string;
  ownerTeam: string;
  severityBands: readonly ('p0' | 'p1' | 'p2' | 'p3')[];
  objective: RecoveryObjective<RecoveryPlaybookContext>;
  windows: readonly PlaybookChannelWindow[];
  tags: Record<string, string>;
}

export interface PlaybookEnvelope {
  playbook: RecoveryPlaybook;
  checksum: string;
  publishedAt?: string;
  generatedFromPlan?: RecoveryPlanId;
}

export interface PlaybookPlanExecution {
  id: RecoveryPlanId;
  runId: Brand<string, 'RecoveryRunId'>;
  playbookId: RecoveryPlaybookId;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  selectedStepIds: readonly RecoveryStepId[];
  startedAt?: string;
  completedAt?: string;
  operator: string;
  telemetry: {
    attempts: number;
    failures: number;
    recoveredStepIds: readonly RecoveryStepId[];
  };
}

export interface PlaybookSelectionPolicy {
  maxStepsPerRun: number;
  allowedStatuses: readonly RecoveryPlaybookStatus[];
  requiredLabels: readonly string[];
  forbiddenChannels: readonly string[];
}

export interface RecoveryPlaybookQuery {
  tenantId?: Brand<string, 'TenantId'>;
  serviceId?: Brand<string, 'ServiceId'>;
  status?: RecoveryPlaybookStatus;
  labels?: readonly string[];
  categories?: readonly string[];
  severityBands?: readonly string[];
  limit?: number;
  cursor?: string;
}

export interface PlaybookSignal {
  name: string;
  value: string | number | boolean;
  weight: number;
}

export type PlaybookPolicyInput = DeepMerge<RecoveryPlaybookContext, {
  score: number;
  incidentsInWindow: number;
  signals: readonly PlaybookSignal[];
}>;

export interface PlaybookRuntimeError {
  stepId: RecoveryStepId;
  reason: string;
  recoverable: boolean;
  when: string;
}

export interface PlaybookExecutionReport {
  run: PlaybookPlanExecution;
  warnings: readonly string[];
  errors: readonly PlaybookRuntimeError[];
  elapsedMinutes: number;
}

export const RecoveryPlaybookIdSchema = z.string().brand<'RecoveryPlaybookId'>();
export const RecoveryPlaybookStepSchema = z.object({
  id: z.string().brand<'RecoveryStepId'>(),
  name: z.string().min(3),
  summary: z.string().min(10),
  type: z.enum(['automated', 'manual', 'human-gate', 'safety-check']),
  rank: z.number().int().min(0),
  owner: z.string().min(1),
  action: z.unknown(),
  scope: z.enum(['region', 'service', 'tenant', 'global']),
  durationMinutes: z.number().min(1),
  retries: z.number().min(0),
  timeoutMinutes: z.number().min(1),
  constraints: z.array(z.object({
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    operator: z.enum(['gte', 'lte', 'eq', 'neq', 'contains', 'matches']),
  })),
  dependencies: z.array(z.object({
    dependsOn: z.string().brand<'RecoveryStepId'>(),
    condition: z.string().optional(),
    optional: z.boolean(),
  })),
  metadata: z.record(z.unknown()),
});

export const RecoveryPlaybookSchema = z.object({
  id: z.string().brand<'RecoveryPlaybookId'>(),
  title: z.string().min(3),
  status: z.enum(['draft', 'published', 'deprecated', 'retired']),
  category: z.string().min(1),
  labels: z.array(z.string()),
  version: z.string(),
  owner: z.string(),
  steps: z.array(RecoveryPlaybookStepSchema).min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  ownerTeam: z.string(),
  severityBands: z.array(z.enum(['p0', 'p1', 'p2', 'p3'])),
  objective: z.object({
    name: z.string(),
    target: z.record(z.unknown()),
    acceptedSlaMinutes: z.number().min(1),
    owner: z.string(),
  }),
  windows: z.array(
    z.object({
      channel: z.string(),
      tz: z.string(),
      fromHour: z.number().min(0).max(23),
      toHour: z.number().min(0).max(23),
    }),
  ),
  tags: z.record(z.string()),
});

export type RecoveryPlaybookInput = z.infer<typeof RecoveryPlaybookSchema>;
