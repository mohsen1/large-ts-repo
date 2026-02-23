import type { Brand, JsonValue } from '@shared/type-level';

export type ScenarioId = Brand<string, 'ScenarioId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type IncidentId = Brand<string, 'IncidentId'>;
export type BlueprintId = Brand<string, 'BlueprintId'>;
export type ActorId = Brand<string, 'ActorId'>;
export type SignalId = Brand<string, 'SignalId'>;

export type IncidentSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RecoveryState =
  | 'idle'
  | 'planned'
  | 'running'
  | 'suspended'
  | 'resolved'
  | 'failed'
  | 'rolledBack';
export type ActionStatus = 'queued' | 'ready' | 'in_progress' | 'complete' | 'blocked' | 'cancelled';

export type ConstraintState = 'met' | 'violated' | 'unknown';

export interface ConstraintSnapshot {
  readonly constraint: ScenarioConstraint;
  readonly score: number;
  readonly state: ConstraintState;
  readonly observedValue?: number;
  readonly evaluatedAt: string;
  readonly windowMinutes: number;
}

export interface IncidentEnvelope {
  readonly id: IncidentId;
  readonly tenantId: TenantId;
  readonly title: string;
  readonly severity: IncidentSeverity;
  readonly service: string;
  readonly region: string;
  readonly detectedAt: string;
  readonly metadata: Record<string, JsonValue>;
}

export interface ScenarioConstraint {
  readonly id: Brand<string, 'ConstraintId'>;
  readonly key: string;
  readonly operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne' | 'contains' | 'exclude';
  readonly threshold: number;
  readonly windowMinutes: number;
}

export interface ScenarioAction {
  readonly id: Brand<string, 'ActionId'>;
  readonly code: string;
  readonly title: string;
  readonly owner: string;
  readonly commandTemplate: string;
  readonly requiredApprovals: number;
  readonly estimatedMinutes: number;
  readonly status: ActionStatus;
  readonly tags: readonly string[];
}

export interface RecoveryBlueprint {
  readonly id: BlueprintId;
  readonly tenantId: TenantId;
  readonly scenarioId: ScenarioId;
  readonly name: string;
  readonly description: string;
  readonly constraints: readonly ScenarioConstraint[];
  readonly actions: readonly ScenarioAction[];
  readonly tags: readonly string[];
  readonly priority: 1 | 2 | 3 | 4 | 5;
}

export interface RecoveryPlan {
  readonly id: Brand<string, 'PlanId'>;
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly scenarioId: ScenarioId;
  readonly blueprintId: BlueprintId;
  readonly state: RecoveryState;
  readonly runbookVersion: string;
  readonly actions: readonly ScenarioAction[];
  readonly confidence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags?: readonly string[];
}

export interface RecoverySignal {
  readonly id: SignalId;
  readonly tenantId: TenantId;
  readonly incidentId: IncidentId;
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly observedAt: string;
  readonly dimensions: Readonly<Record<string, string>>;
}

export interface RecoveryRun {
  readonly id: Brand<string, 'RunId'>;
  readonly planId: RecoveryPlan['id'];
  readonly actorId: ActorId;
  readonly state: RecoveryState;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly progress: number;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export interface RuntimeEnvelope {
  readonly incident: IncidentEnvelope;
  readonly scenario: RecoveryPlan;
  readonly signals: readonly RecoverySignal[];
  readonly createdAt: string;
}

export interface ScenarioIntent {
  readonly scenarioId: ScenarioId;
  readonly tenantId: TenantId;
  readonly label: string;
  readonly owners: readonly string[];
}

export interface OrchestratorContext {
  readonly tenantId: TenantId;
  readonly requestedBy: string;
  readonly startedBy: string;
  readonly startedAt: string;
  readonly tags: readonly string[];
}

export interface ScenarioForecast {
  readonly planId: RecoveryPlan['id'];
  readonly estimatedStartAt: string;
  readonly estimatedFinishAt: string;
  readonly criticalPathMinutes: number;
  readonly successProbability: number;
}
