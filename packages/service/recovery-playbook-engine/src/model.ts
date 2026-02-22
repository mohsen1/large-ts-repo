import { z } from 'zod';
import type { Brand } from '@shared/type-level';
import type {
  RecoveryPlaybookContext,
  RecoveryPlaybookId,
  RecoveryStepId,
  RecoveryPlaybook,
  RecoveryPlaybookStatus,
  PlaybookRuntimeError,
  RecoveryPlaybookQuery,
} from '@domain/recovery-playbooks';

export type RunId = Brand<string, 'RecoveryPlaybookRunId'>;
export type PlanId = Brand<string, 'RecoveryPlanId'>;
export type StageName = Brand<string, 'StageName'>;

export type AtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<T>;
}[keyof T];

export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type NonEmptyArray<T> = [T, ...T[]];

export interface WindowAllocation {
  from: string;
  to: string;
  timezone: string;
}

export interface PlaybookConstraintSignal {
  dimension: string;
  value: number;
  weight: number;
}

export interface PlaybookConstraintSet {
  signals: readonly PlaybookConstraintSignal[];
  minSeverity: number;
  maxSeverity: number;
  tags: readonly string[];
}

export type RunStatus = 'planned' | 'queued' | 'building' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface RunTimeline {
  startedAt?: string;
  queuedAt?: string;
  completedAt?: string;
  abortedAt?: string;
}

export interface RunPlan {
  id: PlanId;
  runId: RunId;
  playbookId: RecoveryPlaybookId;
  tenantId: string;
  createdAt: string;
  status: RunStatus;
  selectedSteps: readonly RecoveryStepId[];
  rationale: readonly string[];
  constraints: PlaybookConstraintSet;
  timeline: RunTimeline;
  expectedMinutes: number;
  riskBucket: 'low' | 'medium' | 'high';
}

export interface StageExecution {
  stage: StageName;
  startedAt?: string;
  endedAt?: string;
  failedSteps: readonly RecoveryStepId[];
  completedSteps: readonly RecoveryStepId[];
}

export interface RunContext {
  runId: RunId;
  tenantId: string;
  playbookId: RecoveryPlaybookId;
  triggeredBy: string;
  context: RecoveryPlaybookContext;
  createdAt: string;
  updatedAt: string;
}

export interface PlanArtifact {
  id: PlanId;
  hash: string;
  source: string;
  createdAt: string;
}

export interface PlaybookSelectorInput {
  context: RecoveryPlaybookContext;
  tenantRiskScore: number;
  tenantPriority: number;
  now: string;
}

export interface PlaybookSelectionResult {
  playbook: RecoveryPlaybook;
  score: number;
  rationale: readonly string[];
  warnings: readonly string[];
  plan: Pick<RunPlan, 'constraints' | 'riskBucket' | 'expectedMinutes'>;
}

export interface OrchestratorState {
  status: RunStatus;
  run: RunContext;
  latestPlanId?: PlanId;
  error?: PlaybookRuntimeError;
  stages: readonly StageExecution[];
}

export interface ServiceEnvelope<T> {
  name: string;
  version: number;
  payload: T;
}

export interface ServiceQueryPlan {
  query: RecoveryPlaybookQuery;
  pageSize: number;
  includeArchived: boolean;
  labels: readonly string[];
}

export interface StageConstraint {
  stage: StageName;
  requires: readonly string[];
  maxDurationMinutes: number;
  allowManualSteps: boolean;
}

export interface RecoveryPolicyProfile {
  name: string;
  priority: number;
  allowedStatuses: readonly RecoveryPlaybookStatus[];
  requiredLabels: readonly string[];
  forbiddenLabels: readonly string[];
  maxSteps: number;
  maxDurationMinutes: number;
}

export const RunIdSchema = z.string().min(12).brand<'RecoveryPlaybookRunId'>();
export const PlanIdSchema = z.string().min(12).brand<'RecoveryPlanId'>();

export const PlaybookConstraintSignalSchema = z.object({
  dimension: z.string(),
  value: z.number(),
  weight: z.number().min(0).max(1),
});

export const PlaybookConstraintSetSchema = z.object({
  signals: z.array(PlaybookConstraintSignalSchema),
  minSeverity: z.number().min(0).max(1),
  maxSeverity: z.number().min(0).max(1),
  tags: z.array(z.string()),
});

export const ServiceQueryPlanSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    labels: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    severityBands: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    cursor: z.string().optional(),
  }),
  pageSize: z.number().int().min(1).max(200),
  includeArchived: z.boolean(),
  labels: z.array(z.string()),
});
