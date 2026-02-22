import { type Brand } from '@shared/core';
import { type RecoveryRunState, type RecoveryStep, type RecoveryWindow } from '@domain/recovery-orchestration';
import { type RunPlanId, type RunSession } from '@domain/recovery-operations-models';
import type { DeepMerge } from '@shared/type-level';

export type RecoveryCadenceId = Brand<string, 'RecoveryCadenceId'>;
export type CadenceRunId = Brand<string, 'CadenceRunId'>;
export type CadenceWindowId = Brand<string, 'CadenceWindowId'>;
export type CadenceSlotId = Brand<string, 'CadenceSlotId'>;

export type CadencePriority = 'low' | 'normal' | 'high' | 'critical';
export type CadenceOutcome = 'ready' | 'deferred' | 'blocked' | 'cancelled' | 'completed';
export type CadenceEnvelopeSource = 'planner' | 'operator' | 'automation' | 'policy';

export interface CadenceWindow extends RecoveryWindow {
  readonly id: CadenceWindowId;
  readonly title: string;
  readonly timezone: string;
  readonly maxParallelism: number;
  readonly maxRetries: number;
  readonly requiredApprovals: number;
}

export interface CadenceSlot {
  readonly id: CadenceSlotId;
  readonly windowId: CadenceWindowId;
  readonly plannedFor: string;
  readonly planId: RunPlanId;
  readonly stepId: RecoveryStep['id'];
  readonly command: RecoveryStep['command'];
  readonly weight: number;
  readonly tags: readonly string[];
  readonly requires: readonly CadenceSlotId[];
  readonly estimatedMinutes: number;
}

export interface CadenceProfile {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly programRun: RecoveryRunState['runId'];
  readonly windows: readonly CadenceWindow[];
  readonly slots: readonly CadenceSlot[];
  readonly priority: CadencePriority;
  readonly source: CadenceEnvelopeSource;
}

export interface CadencePolicyConstraint {
  readonly id: Brand<string, 'CadencePolicyConstraintId'>;
  readonly key: string;
  readonly expression: string;
  readonly enabled: boolean;
  readonly weight: number;
}

export interface CadencePlanCandidate {
  readonly profile: CadenceProfile;
  readonly constraints: readonly CadencePolicyConstraint[];
  readonly notes: readonly string[];
  readonly revision: number;
}

export interface CadenceRunPlan {
  readonly id: RecoveryCadenceId;
  readonly runId: CadenceRunId;
  readonly profile: CadenceProfile;
  readonly candidateHash: Brand<string, 'CadenceCandidateHash'>;
  readonly constraintFingerprint: Brand<string, 'CadenceConstraintFingerprint'>;
  readonly createdAt: string;
  readonly outcome: CadenceOutcome;
  readonly slots: readonly CadenceSlot[];
  readonly windows: readonly CadenceWindow[];
  readonly readinessScore: number;
  readonly policySummary: {
    readonly enabledConstraints: number;
    readonly blockedByRules: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly audit: CadenceRunAudit;
}

export interface CadenceRunAudit {
  readonly createdBy: CadenceEnvelopeSource;
  readonly reviewedBy: readonly Brand<string, 'UserId'>[];
  readonly approved: boolean;
  readonly approvedAt?: string;
  readonly reasonTrail: readonly string[];
}

export interface CadenceExecutionContext {
  readonly runPlan: CadenceRunPlan;
  readonly run: RecoveryRunState;
  readonly session: RunSession;
  readonly seed: number;
}

export interface CadenceMetrics {
  readonly slotCoverage: number;
  readonly averageSlotDuration: number;
  readonly concurrencyPeak: number;
  readonly windowCoverage: number;
}

export interface CadenceEnvelope<TPayload extends object = Record<string, unknown>> {
  readonly id: Brand<string, 'CadenceEnvelopeId'>;
  readonly version: number;
  readonly profile: CadenceProfile;
  readonly payload: TPayload;
}

export type CadenceContextValue = {
  readonly tenant: string;
  readonly riskTier: CadencePriority;
  readonly targetZones: readonly string[];
};

export type CadenceInput<T> =
  | { readonly mode: 'candidate'; readonly candidate: CadencePlanCandidate; readonly runId: CadenceRunId }
  | { readonly mode: 'plan'; readonly plan: CadenceRunPlan; readonly runId: CadenceRunId; readonly executionContext?: T };

export type CadenceMerge<A, B> = DeepMerge<A, B>;

export interface CadenceEvaluation {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly score: number;
  readonly warnings: readonly string[];
}

export interface CadenceExecutionWindow {
  readonly runId: CadenceRunId;
  readonly window: CadenceWindow;
  readonly slots: readonly CadenceSlot[];
  readonly index: number;
  readonly total: number;
}
