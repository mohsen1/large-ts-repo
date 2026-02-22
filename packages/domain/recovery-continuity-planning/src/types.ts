import { Brand } from '@shared/core';

export type ContinuityTenantId = Brand<string, 'ContinuityTenantId'>;
export type ContinuityPlanId = Brand<string, 'ContinuityPlanId'>;
export type ContinuityRunId = Brand<string, 'ContinuityRunId'>;
export type ContinuityArtifactId = Brand<string, 'ContinuityArtifactId'>;
export type ContinuityRegion = Brand<string, 'ContinuityRegion'>;

export type ContinuityPriority = 'bronze' | 'silver' | 'gold' | 'platinum' | 'critical';
export type ContinuityRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ContinuityState =
  | 'draft'
  | 'validated'
  | 'ready'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'canceled';

export interface RecoveryDependency {
  readonly dependsOn: ContinuityArtifactId;
  readonly type: 'service' | 'artifact' | 'network';
  readonly criticality: ContinuityRiskLevel;
}

export interface ContinuityTaskTemplate {
  readonly artifactId: ContinuityArtifactId;
  readonly title: string;
  readonly command: string;
  readonly region: ContinuityRegion;
  readonly dependencies: readonly RecoveryDependency[];
  readonly estimatedLatencyMs: number;
  readonly recoveryTimeObjectiveMinutes: number;
  readonly risk: ContinuityRiskLevel;
  readonly tags: readonly string[];
}

export interface ContinuityPlanTemplate {
  readonly id: ContinuityPlanId;
  readonly tenantId: ContinuityTenantId;
  readonly displayName: string;
  readonly summary: string;
  readonly ownerTeam: string;
  readonly region: ContinuityRegion;
  readonly priority: ContinuityPriority;
  readonly priorityWeight: number;
  readonly tasks: readonly ContinuityTaskTemplate[];
  readonly slaMinutes: number;
  readonly maxConcurrentTasks: number;
  readonly enabled: boolean;
  readonly expectedDependencies: readonly RecoveryDependency[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContinuityRunInput {
  readonly runId: ContinuityRunId;
  readonly tenantId: ContinuityTenantId;
  readonly planId: ContinuityPlanId;
  readonly requestedWindow: {
    readonly startAt: string;
    readonly endAt: string;
    readonly tz: string;
  };
  readonly targetServices: readonly string[];
  readonly dryRun: boolean;
  readonly createdAt: string;
}

export interface ContinuityRunStep {
  readonly taskId: ContinuityArtifactId;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  readonly retryCount: number;
}

export interface ContinuityRunContext {
  readonly runId: ContinuityRunId;
  readonly state: ContinuityState;
  readonly tenantId: ContinuityTenantId;
  readonly planId: ContinuityPlanId;
  readonly steps: readonly ContinuityRunStep[];
  readonly startedAt: string;
  readonly deadlineAt: string;
  readonly trace: readonly string[];
}

export interface ContinuityDecisionEnvelope<TPayload> {
  readonly tenantId: ContinuityTenantId;
  readonly runId: ContinuityRunId;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly emittedAt: string;
}

export type NumericRange<T extends number> = [min: T, max: T];

export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends Date
    ? T
    : T extends Array<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export interface WeightedNode<TId extends string = string, TValue = unknown> {
  readonly id: Brand<TId, 'WeightedNodeId'>;
  readonly value: TValue;
  readonly weight: number;
  readonly zone: ContinuityRegion;
}

export type PartitionBy<T, K extends keyof T> = Map<T[K], T[]>;

export type AuditTrailEntry = Readonly<{
  at: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
}>;

export interface ContinuityAuditLog {
  readonly runId: ContinuityRunId;
  readonly tenantId: ContinuityTenantId;
  readonly entries: readonly AuditTrailEntry[];
}
