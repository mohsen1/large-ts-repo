import type {
  RecoverySimulationResult,
  PlanId,
  ScenarioId,
  TenantId,
} from '@domain/recovery-scenario-planner/src';

export interface StoredScenarioSummary {
  readonly scenarioId: ScenarioId;
  readonly tenantId: TenantId;
  readonly title: string;
  readonly status: RecoverySimulationResult['windowState'];
  readonly createdAtUtc: string;
  readonly tags: readonly string[];
}

export interface StoredScenarioRecord {
  readonly scenarioId: ScenarioId;
  readonly tenantId: TenantId;
  readonly planId: PlanId;
  readonly payload: RecoverySimulationResult;
  readonly createdAtUtc: string;
  readonly archivedAtUtc?: string;
}

export interface TenantScenarioIndex {
  readonly tenantId: TenantId;
  readonly scenarios: readonly ScenarioId[];
}

export interface ScenarioStoreSnapshot {
  readonly tenantId: TenantId;
  readonly count: number;
  readonly active: number;
  readonly canceled: number;
  readonly newestScenarioId?: ScenarioId;
}
