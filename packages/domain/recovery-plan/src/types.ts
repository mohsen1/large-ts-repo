import type { Brand, ReadonlyDeep } from '@shared/core';
import type {
  RecoveryMode,
  RecoveryProgram,
  RecoveryPriority,
  RecoveryRunState,
  RecoveryStep,
} from '@domain/recovery-orchestration';
import type {
  RecoveryPolicyEvaluation,
  RecoveryPolicyId,
} from '@domain/recovery-policy';
import type { RecoveryRunId } from '@domain/recovery-orchestration';

export type RecoveryPlanId = Brand<string, 'RecoveryPlanId'>;
export type RecoveryPlanVersion = `v${number}`;
export type RecoveryRouteId = Brand<string, 'RecoveryRouteId'>;
export type RecoveryStageName = 'prepare' | 'execute' | 'validate' | 'rollback';

export interface RecoveryStageObjective {
  readonly key: string;
  readonly weight: number;
  readonly successCriteria: readonly string[];
}

export interface RecoveryRoute {
  readonly id: RecoveryRouteId;
  readonly stepIds: readonly RecoveryStep['id'][];
  readonly description: string;
  readonly resilienceScore: number;
  readonly expectedSeconds: number;
  readonly objectives: readonly RecoveryStageObjective[];
}

export interface RecoveryConstraintWindow {
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
}

export interface RecoveryPlanMetadata {
  readonly owner: string;
  readonly correlationId: string;
  readonly environment: string;
  readonly runWindow: RecoveryConstraintWindow;
  readonly tags: Readonly<Record<string, string>>;
}

export type RecoveryPlanSignal = {
  readonly id: Brand<string, 'RecoveryPlanSignal'>;
  readonly source: 'policy' | 'risk' | 'ops';
  readonly value: number;
  readonly note: string;
};

export interface RecoveryPlanCandidate {
  readonly id: RecoveryPlanId;
  readonly route: RecoveryRoute;
  readonly estimatedMinutes: number;
  readonly confidence: number;
  readonly rationale: readonly string[];
  readonly blockingPolicyCount: number;
  readonly policyEvaluations: readonly RecoveryPolicyEvaluation[];
  readonly signals: readonly RecoveryPlanSignal[];
}

export interface RecoveryPlanSummary {
  readonly planId: RecoveryPlanId;
  readonly version: RecoveryPlanVersion;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly programId: RecoveryProgram['id'];
  readonly policyCount: number;
  readonly routeCount: number;
  readonly estimatedMinutes: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecoveryExecutionPlan {
  readonly planId: RecoveryPlanId;
  readonly runId: RecoveryRunState['runId'];
  readonly version: RecoveryPlanVersion;
  readonly candidates: readonly RecoveryPlanCandidate[];
  readonly selected: RecoveryPlanCandidate['id'];
  readonly stagedSequence: readonly RecoveryStageName[];
  readonly metadata: RecoveryPlanMetadata;
}

export interface RecoveryPlanTemplate {
  readonly id: RecoveryPlanId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly service: Brand<string, 'ServiceId'>;
  readonly priority: RecoveryPriority;
  readonly mode: RecoveryMode;
  readonly routes: readonly RecoveryRoute[];
  readonly maxRetries: number;
  readonly window: RecoveryProgram['window'];
  readonly policyReferences: readonly RecoveryPolicyId[];
}

export interface RecoveryPlanSnapshot {
  readonly id: RecoveryPlanId;
  readonly runId: RecoveryRunState['runId'];
  readonly program: RecoveryProgram;
  readonly plan: RecoveryExecutionPlan;
  readonly createdAt: string;
}

export interface RecoveryExecutionContext {
  readonly program: RecoveryProgram;
  readonly runState: ReadonlyDeep<RecoveryRunState>;
  readonly requestedBy: string;
  readonly correlationId: string;
  readonly candidateBudget: number;
}

export interface RecoveryPlanExecutionContext {
  readonly runId: RecoveryRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly requestedBy: string;
  readonly candidateBudget: number;
}
