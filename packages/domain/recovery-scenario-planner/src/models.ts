import type { Brand, DeepReadonly, NonEmptyArray, Merge } from '@shared/type-level';

export type TenantId = Brand<string, 'tenant-id'>;
export type ScenarioId = Brand<string, 'scenario-id'>;
export type PlanId = Brand<string, 'plan-id'>;
export type SignalId = Brand<string, 'signal-id'>;
export type ActionId = Brand<string, 'action-id'>;

export type ScenarioSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ScenarioWindowState = 'draft' | 'simulating' | 'approved' | 'executing' | 'completed' | 'canceled';

export interface RecoveryWindow {
  readonly windowId: Brand<string, 'recovery-window-id'>;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly region: string;
  readonly ownerTeam: string;
}

export interface SignalFingerprint {
  readonly source: string;
  readonly code: string;
  readonly attributes: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RecoverySignalInput {
  readonly signalId: SignalId;
  readonly tenantId: TenantId;
  readonly entity: string;
  readonly timestampUtc: string;
  readonly severity: ScenarioSeverity;
  readonly confidence: number;
  readonly fingerprint: SignalFingerprint;
}

export interface ActionDependency {
  readonly dependencyId: Brand<string, 'action-dependency'>;
  readonly dependsOn: readonly ActionId[];
  readonly requiredSignalId?: SignalId;
}

export interface ActionCandidate {
  readonly actionId: ActionId;
  readonly service: string;
  readonly category: 'rollback' | 'evacuate' | 'scale' | 'patch' | 'validate';
  readonly estimatedMinutes: number;
  readonly sideEffects: readonly string[];
  readonly rollbackMinutes: number;
  readonly labels: readonly string[];
  readonly dependency: ActionDependency;
}

export interface PolicyConstraint {
  readonly maxConcurrency: number;
  readonly allowedCategories: readonly ActionCandidate['category'][];
  readonly blackoutWindows: readonly RecoveryWindow[];
  readonly slaMinutes: number;
}

export interface ScenarioPolicy {
  readonly policyId: Brand<string, 'policy-id'>;
  readonly tenantId: TenantId;
  readonly priorityBuckets: readonly ScenarioSeverity[];
  readonly mustMaintainReadiness: boolean;
  readonly preferredClockSkewSeconds: number;
  readonly constraints: PolicyConstraint;
}

export interface ScenarioBlueprint {
  readonly scenarioId: ScenarioId;
  readonly tenantId: TenantId;
  readonly bundleId: Brand<string, 'bundle-id'>;
  readonly runId: Brand<string, 'run-id'>;
  readonly signals: DeepReadonly<readonly RecoverySignalInput[]>;
  readonly policy: ScenarioPolicy;
  readonly plannedAtUtc: string;
}

export interface RecoveryActionPlan {
  readonly planId: PlanId;
  readonly scenarioId: ScenarioId;
  readonly sequence: NonEmptyArray<ActionCandidate>;
  readonly estimatedCompletionMinutes: number;
  readonly aggregateConfidence: number;
  readonly rationale: string;
  readonly window: RecoveryWindow;
  readonly createdAtUtc: string;
}

export interface RecoverySimulationResult {
  readonly scenarioId: ScenarioId;
  readonly tenantId: TenantId;
  readonly actionPlan: DeepReadonly<RecoveryActionPlan>;
  readonly finalRiskScore: number;
  readonly windowState: ScenarioWindowState;
  readonly notes: DeepReadonly<readonly string[]>;
}

export type WindowStateUpdate = Merge<RecoverySimulationResult, { readonly updatedAtUtc: string }>;
