import type { Brand } from '@shared/core';
import type { IncidentRecord, IncidentId, IncidentSeverity, TenantId, ServiceId } from '@domain/incident-management';
import type { RecoveryProgram, RecoveryWindow, RecoveryRunState, RecoveryWindow as OrchestrationWindow, RecoveryStep } from '@domain/recovery-orchestration';

export type FabricId = Brand<string, 'FabricId'>;
export type FabricRunId = Brand<string, 'FabricRunId'>;
export type FabricCommandId = Brand<string, 'FabricCommandId'>;
export type FabricGateId = Brand<string, 'FabricGateId'>;
export type FabricPolicyId = Brand<string, 'FabricPolicyId'>;
export type FabricReadinessLevel = 'cold' | 'warm' | 'hot' | 'critical';
export type FabricRiskBand = 'green' | 'amber' | 'red' | 'black';
export type FabricDependencyMode = 'hard' | 'soft' | 'advisory';
export type FabricStrategyMode = 'parallel' | 'serial' | 'staged';

export interface FabricActor {
  readonly actorId: Brand<string, 'ActorId'>;
  readonly tenantId: TenantId;
  readonly displayName: string;
  readonly role: 'platform' | 'security' | 'sre' | 'network' | 'datastore';
  readonly expertise: readonly string[];
}

export interface FabricSignal {
  readonly commandId: FabricCommandId;
  readonly tenantId: TenantId;
  readonly source: string;
  readonly severity: IncidentSeverity;
  readonly confidence: number;
  readonly detectedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
}

export interface FabricConstraint {
  readonly name: string;
  readonly weight: number;
  readonly requiredWhen: FabricRiskBand;
  readonly policyId: FabricPolicyId;
}

export interface FabricCommand<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: FabricCommandId;
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly name: string;
  readonly priority: 1 | 2 | 3 | 4 | 5;
  readonly blastRadius: number;
  readonly estimatedRecoveryMinutes: number;
  readonly strategy: FabricStrategyMode;
  readonly constraints: readonly FabricConstraint[];
  readonly runbook: RecoveryStep[];
  readonly context: Readonly<TContext>;
  readonly requiresApprovals: number;
  readonly requiresWindows: readonly RecoveryWindow[];
}

export interface FabricDependencyEdge {
  readonly from: FabricCommandId;
  readonly to: FabricCommandId;
  readonly mode: FabricDependencyMode;
  readonly rationale: string;
  readonly mandatory: boolean;
}

export interface FabricTopology {
  readonly commandIds: readonly FabricCommandId[];
  readonly edges: readonly FabricDependencyEdge[];
  readonly zones: Readonly<Record<string, FabricCommandId[]>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface FabricPolicy {
  readonly id: FabricPolicyId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  readonly readinessThreshold: FabricReadinessLevel;
  readonly riskTolerance: FabricRiskBand;
  readonly maxParallelism: number;
  readonly maxRetries: number;
  readonly windowHours: {
    readonly min: number;
    readonly max: number;
  };
  readonly gates: readonly FabricGate[];
}

export interface FabricGate {
  readonly id: FabricGateId;
  readonly policyId: FabricPolicyId;
  readonly commandId: FabricCommandId;
  readonly order: number;
  readonly requiredState: 'planned' | 'approved' | 'executed' | 'verified';
}

export interface FabricRun {
  readonly id: FabricRunId;
  readonly tenantId: TenantId;
  readonly fabricId: FabricId;
  readonly policyId: FabricPolicyId;
  readonly incidentId: IncidentId;
  readonly commandIds: readonly FabricCommandId[];
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: 'draft' | 'queued' | 'running' | 'blocked' | 'succeeded' | 'partially-succeeded' | 'failed';
  readonly readinessBand: FabricReadinessLevel;
  readonly riskBand: FabricRiskBand;
  readonly windows: readonly OrchestrationWindow[];
}

export interface FabricRunCheckpoint {
  readonly fabricRunId: FabricRunId;
  readonly stepIndex: number;
  readonly commandId: FabricCommandId;
  readonly executedAt: string;
  readonly operator: FabricActor['actorId'];
  readonly status: 'ok' | 'warn' | 'error';
  readonly output: Readonly<Record<string, unknown>>;
}

export interface FabricPlanSnapshot {
  readonly id: Brand<string, 'FabricPlanSnapshotId'>;
  readonly tenantId: TenantId;
  readonly fabricRunId: FabricRunId;
  readonly generatedAt: string;
  readonly commandCount: number;
  readonly maxDepth: number;
  readonly totalDurationMinutes: number;
}

export interface FabricExecutionContext {
  readonly tenantId: TenantId;
  readonly fabricId: FabricId;
  readonly program: RecoveryProgram;
  readonly incident: IncidentRecord;
  readonly policy: FabricPolicy;
  readonly signals: readonly FabricSignal[];
  readonly runStates: readonly RecoveryRunState[];
}

export interface FabricPlan {
  readonly tenantId: TenantId;
  readonly policyId: FabricPolicyId;
  readonly fabricId: FabricId;
  readonly commands: readonly FabricCommand[];
  readonly topology: FabricTopology;
}

export interface FabricValidationReport {
  readonly tenantId: TenantId;
  readonly fabricId: FabricId;
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly createdAt: string;
}

export type FabricCommandMap<T = FabricCommand> = Map<FabricCommandId, T>;
export type FabricDependencyMatrix = Readonly<Map<FabricCommandId, FabricCommandId[]>>;

export type FabricPlanSelection<TContext extends Record<string, unknown> = Record<string, unknown>> = {
  readonly command: FabricCommand<TContext>;
  readonly selected: boolean;
  readonly rank: number;
};

export interface FabricAnalysisResult {
  readonly fabricId: FabricId;
  readonly canExecute: boolean;
  readonly readinessBand: FabricReadinessLevel;
  readonly riskBand: FabricRiskBand;
  readonly selectedCommandIds: readonly FabricCommandId[];
  readonly commandCount: number;
  readonly maxRiskCommand: FabricCommandId | null;
  readonly warnings: readonly string[];
}

export interface FabricManifest {
  readonly id: Brand<string, 'FabricManifestId'>;
  readonly tenantId: TenantId;
  readonly sourceProgram: RecoveryProgram;
  readonly plan: FabricPlan;
  readonly policy: FabricPolicy;
  readonly run: FabricRun | null;
  readonly snapshots: readonly FabricPlanSnapshot[];
}
