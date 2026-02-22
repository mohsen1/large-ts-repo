import { Brand, NodeId, normalizeLimit } from '@shared/core';
import { z } from 'zod';

export type ContinuityPlanId = Brand<string, 'ContinuityPlanId'>;
export type ContinuityRunId = Brand<string, 'ContinuityRunId'>;
export type ContinuityTenantId = Brand<string, 'ContinuityTenantId'>;
export type ContinuityServiceId = Brand<string, 'ContinuityServiceId'>;
export type ContinuityStepId = Brand<string, 'ContinuityStepId'>;
export type ContinuityActionId = Brand<string, 'ContinuityActionId'>;
export type ContinuityCorrelationId = Brand<string, 'ContinuityCorrelationId'>;

export type ContinuityPhase = 'assess' | 'lockdown' | 'drain' | 'migrate' | 'restore' | 'verify' | 'close';
export type ContinuitySeverity = 'critical' | 'high' | 'medium' | 'low';
export type ContinuityState =
  | 'draft'
  | 'validated'
  | 'queued'
  | 'in-flight'
  | 'blocked'
  | 'completed'
  | 'rolled-back'
  | 'aborted';

export type ContinuityRunState =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type StageCondition<C extends Record<string, unknown> = Record<string, unknown>> = {
  key: string;
  expected: ReadonlyArray<unknown>;
  predicate?: (context: C) => boolean;
  required: boolean;
};

export type NonEmptyArray<T> = [T, ...T[]];
export type ReadonlyRecord<K extends string, V> = Readonly<Record<K, V>>;
export type DependencyMap<K extends string> = Readonly<Record<K, ReadonlyArray<K>>>;

export interface ContinuityPolicy {
  id: Brand<string, 'ContinuityPolicyId'>;
  tenantId: ContinuityTenantId;
  name: string;
  minPriority: ContinuitySeverity;
  maxParallelSteps: number;
  allowedRegions: readonly string[];
  slaMinutes: number;
}

export interface ContinuityContext {
  tenantId: ContinuityTenantId;
  correlationId: ContinuityCorrelationId;
  region: string;
  requestedBy: Brand<string, 'UserId'>;
  requestedAt: string;
  businessImpact: number;
  servicesInScope: readonly ContinuityServiceId[];
  metadata?: ReadonlyRecord<string, unknown>;
}

export interface ContinuityActionTemplate<C extends Record<string, unknown> = Record<string, unknown>> {
  id: ContinuityActionId;
  type: 'snapshot' | 'freeze' | 'drain' | 'failover' | 'replay' | 'validate' | 'notify';
  title: string;
  description: string;
  requiredApprovals: number;
  timeoutSeconds: number;
  defaults: C;
}

export interface ContinuityStepTemplate<C extends Record<string, unknown> = Record<string, unknown>> {
  id: ContinuityStepId;
  name: string;
  phase: ContinuityPhase;
  action: ContinuityActionTemplate<C>;
  dependsOn: readonly ContinuityStepId[];
  conditions: readonly StageCondition<C>[];
  serviceIds: readonly ContinuityServiceId[];
  retryLimit: number;
  rollbackTarget?: ContinuityStepId;
}

export interface ContinuityPlanTemplate<C extends Record<string, unknown> = Record<string, unknown>> {
  id: ContinuityPlanId;
  tenantId: ContinuityTenantId;
  policy: ContinuityPolicy;
  name: string;
  description?: string;
  severity: ContinuitySeverity;
  context: ContinuityContext;
  steps: readonly ContinuityStepTemplate<C>[];
  notes?: string;
}

export interface ContinuityRuntimeStep<C extends Record<string, unknown> = Record<string, unknown>> {
  id: ContinuityStepId;
  phase: ContinuityPhase;
  action: ContinuityActionTemplate<C>;
  retryCount: number;
  order: number;
  serviceIds: readonly ContinuityServiceId[];
  estimatedMinutes: number;
  dependencies: readonly ContinuityStepId[];
}

export interface ContinuityRuntimePlan<C extends Record<string, unknown> = Record<string, unknown>> {
  id: ContinuityRunId;
  templateId: ContinuityPlanId;
  tenantId: ContinuityTenantId;
  state: ContinuityRunState;
  createdAt: string;
  updatedAt: string;
  correlationId: ContinuityCorrelationId;
  steps: ReadonlyArray<ContinuityRuntimeStep<C>>;
  metadata: ReadonlyRecord<string, unknown>;
}

export interface ContinuityExecutionContext<C extends Record<string, unknown> = Record<string, unknown>> {
  runId: ContinuityRunId;
  trace: {
    runVersion: number;
    parent?: ContinuityRunId;
  };
  payload: C;
}

export interface ContinuityEventEnvelope<C = Record<string, unknown>> {
  runId: ContinuityRunId;
  stepId?: ContinuityStepId;
  tenantId: ContinuityTenantId;
  eventType: 'plan.ready' | 'plan.started' | 'step.started' | 'step.completed' | 'step.failed' | 'plan.finished';
  when: string;
  correlationId: ContinuityCorrelationId;
  payload: C;
}

export interface StageWindow {
  start: string;
  end: string;
}

export interface ContinuityRunStats {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  blockedSteps: number;
  runMinutes: number;
}

export interface RunQueryOptions {
  cursor?: string;
  limit?: number;
  states?: readonly ContinuityRunState[];
  tenantId?: ContinuityTenantId;
}

export const phaseWeight: ReadonlyRecord<ContinuityPhase, number> = {
  assess: 0,
  lockdown: 1,
  drain: 2,
  migrate: 3,
  restore: 4,
  verify: 5,
  close: 6,
};

export const stateTerminal: ReadonlyArray<ContinuityRunState> = ['succeeded', 'failed', 'cancelled'];

export const normalizeLimitOrDefault = (limit?: number): number => normalizeLimit(limit);

export const isTerminalState = (state: ContinuityRunState): boolean => stateTerminal.includes(state);
export const isCriticalSeverity = (severity: ContinuitySeverity): boolean => severity === 'critical' || severity === 'high';

export const phaseCompare = (left: ContinuityPhase, right: ContinuityPhase): number =>
  phaseWeight[left] - phaseWeight[right];

export const normalizePolicy = (policy: ContinuityPolicy): ContinuityPolicy => ({
  ...policy,
  allowedRegions: [...policy.allowedRegions],
  maxParallelSteps: Math.max(1, Math.min(policy.maxParallelSteps, 64)),
  slaMinutes: Math.max(1, policy.slaMinutes),
});

export const continuityPlanSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string().optional(),
  context: z.object({
    tenantId: z.string(),
    correlationId: z.string(),
    region: z.string(),
    requestedBy: z.string(),
    requestedAt: z.string(),
    businessImpact: z.number().min(0).max(100),
    servicesInScope: z.array(z.string()),
    metadata: z.record(z.unknown()).optional(),
  }),
  policy: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string().min(1),
    minPriority: z.enum(['critical', 'high', 'medium', 'low']),
    maxParallelSteps: z.number().int().min(1).max(64),
    allowedRegions: z.array(z.string()),
    slaMinutes: z.number().int().min(1),
  }),
  steps: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        phase: z.enum(['assess', 'lockdown', 'drain', 'migrate', 'restore', 'verify', 'close']),
        dependsOn: z.array(z.string()),
        retryLimit: z.number().int().min(0).max(8),
        serviceIds: z.array(z.string()),
        conditions: z.array(
          z.object({
            key: z.string().min(1),
            expected: z.array(z.unknown()),
            required: z.boolean(),
          }),
        ),
        rollbackTarget: z.string().optional(),
        action: z.object({
          id: z.string(),
          type: z.enum(['snapshot', 'freeze', 'drain', 'failover', 'replay', 'validate', 'notify']),
          title: z.string(),
          description: z.string(),
          requiredApprovals: z.number().int().min(0),
          timeoutSeconds: z.number().int().min(1),
          defaults: z.record(z.unknown()),
        }),
      }),
    )
    .min(1),
});

export type ContinuityPlanInput = z.infer<typeof continuityPlanSchema>;

export const isAllowedStepSequence = (
  sequence: readonly ContinuityPhase[],
): boolean => {
  for (let i = 1; i < sequence.length; i += 1) {
    if (phaseCompare(sequence[i - 1], sequence[i]) > 0) {
      return false;
    }
  }
  return true;
};
