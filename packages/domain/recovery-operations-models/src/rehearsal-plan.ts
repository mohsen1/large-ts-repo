import { z } from 'zod';

import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { IncidentClass, IncidentFingerprint, RecoveryConstraintBudget } from './types';

export type RehearsalId = Brand<string, 'RehearsalId'>;
export type RehearsalStepId = Brand<string, 'RehearsalStepId'>;
export type RehearsalRunId = Brand<string, 'RehearsalRunId'>;

export type RehearsalMode = 'tabletop' | 'semi-automated' | 'fully-automated' | 'live' | 'chaos';
export type RehearsalRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RehearsalCoverage = 'partial' | 'regional' | 'global';

export type RehearsalStepExecutionState = 'not-started' | 'in-progress' | 'success' | 'failed' | 'skipped';

export type RehearsalStepName =
  | 'initialize'
  | 'baseline'
  | 'inject-fault'
  | 'restore-service'
  | 'verify-customer-impact'
  | 'closeout';

export interface RehearsalStepState<TStatus extends RehearsalStepName = RehearsalStepName> {
  readonly id: RehearsalStepId;
  readonly name: TStatus;
  readonly status: RehearsalStepExecutionState;
  readonly owner: string;
  readonly dependsOn: readonly RehearsalStepId[];
  readonly metadata: Record<string, unknown>;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface RehearsalStep<TStatus extends RehearsalStepName = RehearsalStepName> extends Omit<RehearsalStepState<TStatus>, 'status'> {
  readonly name: TStatus;
  readonly description: string;
  readonly lane: 'control-plane' | 'data-plane' | 'platform';
  readonly expectedDurationMinutes: number;
  readonly requiredApprovals: number;
  readonly estimatedSuccessProbability: number;
  readonly status: RehearsalStepExecutionState;
  readonly evidence: readonly RehearsalEvidence[];
  readonly tags: readonly string[];
}

export interface RehearsalPlan {
  readonly id: RehearsalId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: RehearsalRunId;
  readonly ticketId: string;
  readonly mode: RehearsalMode;
  readonly riskLevel: RehearsalRiskLevel;
  readonly coverage: RehearsalCoverage;
  readonly incidentId: string;
  readonly objective: string;
  readonly fingerprint: IncidentFingerprint;
  readonly budget: RecoveryConstraintBudget;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: readonly RehearsalStep[];
}

export type RehearsalExecutionState = 'planning' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface RehearsalSummary {
  readonly planId: RehearsalId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly status: RehearsalExecutionState;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly riskSignalCount: number;
  readonly readinessScore: number;
  readonly durationMinutes: number;
  readonly finalizedAt?: string;
}

export interface RehearsalEvidence {
  readonly id: RehearsalStepId;
  readonly runAt: string;
  readonly source: string;
  readonly key: string;
  readonly value: string;
  readonly severity: 'info' | 'warn' | 'error';
}

export interface RehearsalScheduleWindow {
  readonly id: RehearsalId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly timezone: string;
  readonly from: string;
  readonly to: string;
  readonly allowedDeviations: readonly string[];
}

export interface RehearsalTemplate<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: RehearsalMode;
  readonly name: string;
  readonly description: string;
  readonly objectiveTemplate: string;
  readonly expectedSignals: readonly string[];
  readonly metadata: TMeta;
}

export interface RehearsalScenario<TMeta = unknown> {
  readonly id: RehearsalId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly mode: RehearsalMode;
  readonly name: string;
  readonly trigger: string;
  readonly assumptions: readonly string[];
  readonly injectors: readonly string[];
  readonly rollbackStrategy: string;
  readonly meta: TMeta;
}

export interface RehearsalEnvelope<TPayload> {
  readonly envelopeId: Brand<string, 'RehearsalEnvelopeId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export interface RehearsalSignal {
  readonly id: string;
  readonly runId: RehearsalRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly source: string;
  readonly category: 'signal' | 'metric' | 'audit';
  readonly severity: number;
  readonly confidence: number;
  readonly observedAt: string;
  readonly context: Record<string, unknown>;
}

export type RehearsalWindow = Readonly<{
  from: string;
  to: string;
  zone: string;
}>;

export interface RehearsalQueryFilter {
  readonly tenant?: Brand<string, 'TenantId'>;
  readonly runId?: RehearsalRunId;
  readonly ticketId?: string;
  readonly mode?: readonly RehearsalMode[];
  readonly riskLevel?: readonly RehearsalRiskLevel[];
  readonly status?: readonly RehearsalExecutionState[];
  readonly window?: RehearsalWindow;
}

export type BrandedOptional<TValue extends object> = {
  [K in keyof TValue]?: TValue[K];
};

export type RehearsalResult<T> = T extends { status: 'completed' }
  ? { ok: true; value: T }
  : { ok: false; reason: string; state: RehearsalExecutionState };

export interface RehearsalExecutionRecord {
  readonly runId: RehearsalRunId;
  readonly planId: RehearsalId;
  readonly startedAt: string;
  readonly status: RehearsalExecutionState;
  readonly timeline: readonly RehearsalStep[];
  readonly summary: RehearsalSummary;
}

export interface RehearsalExecutionEnvelope<TPayload> {
  readonly runId: RehearsalRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly payload: TPayload;
  readonly envelopeType: 'plan' | 'signal' | 'summary';
  readonly emittedAt: string;
}

const rehearsalModeEnum = z.enum(['tabletop', 'semi-automated', 'fully-automated', 'live', 'chaos']);
const riskLevelEnum = z.enum(['low', 'medium', 'high', 'critical']);
const stepStateEnum = z.enum(['not-started', 'in-progress', 'success', 'failed', 'skipped']);
const stepNameEnum = z.enum(['initialize', 'baseline', 'inject-fault', 'restore-service', 'verify-customer-impact', 'closeout']);

export const parseRehearsalPlan = (input: unknown): RehearsalPlan => {
  const schema = z.object({
    id: z.string().min(1),
    tenant: z.string().min(1),
    runId: z.string().min(1),
    ticketId: z.string().min(1),
    mode: rehearsalModeEnum,
    riskLevel: riskLevelEnum,
    coverage: z.enum(['partial', 'regional', 'global']),
    incidentId: z.string().min(1),
    objective: z.string().min(1),
    fingerprint: z.object({
      tenant: z.string().min(1),
      region: z.string().min(1),
      serviceFamily: z.string().min(1),
      impactClass: z.string(),
      estimatedRecoveryMinutes: z.number().nonnegative(),
    }),
    budget: z.object({
      maxParallelism: z.number().int().min(1).max(64),
      maxRetries: z.number().int().min(0).max(12),
      timeoutMinutes: z.number().int().min(1),
      operatorApprovalRequired: z.boolean(),
    }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    steps: z.array(z.object({
      id: z.string().min(1),
      name: stepNameEnum,
      description: z.string().min(1),
      lane: z.enum(['control-plane', 'data-plane', 'platform']),
      expectedDurationMinutes: z.number().min(1),
      requiredApprovals: z.number().min(0).max(10),
      estimatedSuccessProbability: z.number().min(0).max(1),
      status: stepStateEnum,
      owner: z.string().min(1),
      dependsOn: z.array(z.string()),
      metadata: z.record(z.unknown()),
      evidence: z.array(z.object({
        id: z.string().min(1),
        runAt: z.string().datetime(),
        source: z.string().min(1),
        key: z.string().min(1),
        value: z.string(),
        severity: z.enum(['info', 'warn', 'error']),
      })),
      tags: z.array(z.string()),
    })),
  }).parse(input);

  return {
    ...schema,
    tenant: withBrand(schema.tenant, 'TenantId'),
    runId: withBrand(schema.runId, 'RehearsalRunId'),
    id: withBrand(schema.id, 'RehearsalId'),
    steps: schema.steps.map((step) => ({
      ...step,
      id: withBrand(step.id, 'RehearsalStepId'),
      dependsOn: step.dependsOn.map((dep) => withBrand(dep, 'RehearsalStepId')),
      evidence: step.evidence.map((item) => ({
        ...item,
        id: withBrand(item.id, 'RehearsalStepId'),
      })),
      metadata: step.metadata,
    })),
    fingerprint: {
      ...schema.fingerprint,
      tenant: withBrand(schema.fingerprint.tenant, 'TenantId'),
      impactClass: schema.fingerprint.impactClass as IncidentClass,
    },
  };
};

export const createRehearsalEnvelope = <TPayload>(tenant: string, payload: TPayload): RehearsalEnvelope<TPayload> => ({
  envelopeId: withBrand(`rehearsal-${Date.now()}`, 'RehearsalEnvelopeId'),
  tenant: withBrand(tenant, 'TenantId'),
  payload,
  createdAt: new Date().toISOString(),
});

export const normalizeRehearsalSummary = (input: BrandedOptional<RehearsalSummary>): RehearsalSummary => {
  const tenant = input.tenant ?? withBrand('default-tenant', 'TenantId');
  const completedSteps = input.completedSteps ?? 0;
  const totalSteps = input.totalSteps ?? 0;
  const riskSignalCount = input.riskSignalCount ?? 0;
  const readinessScore = input.readinessScore ?? 0;
  const durationMinutes = input.durationMinutes ?? 0;

  return {
    planId: input.planId ?? withBrand('rehearsal-default', 'RehearsalId'),
    tenant,
    status: input.status ?? 'planning',
    completedSteps,
    totalSteps,
    riskSignalCount,
    readinessScore,
    durationMinutes,
    finalizedAt: input.finalizedAt,
  };
};
