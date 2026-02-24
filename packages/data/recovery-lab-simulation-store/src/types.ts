import type { LabExecution, LabExecutionResult, LabScenario, LabPlanTemplate, LabTelemetry } from '@domain/recovery-simulation-lab-core';
import { asLabRunId, asLabTenantId, asLabScenarioId, type LabTenantId } from '@shared/recovery-lab-kernel';

export type StoreRecord<T> = {
  readonly id: string;
  readonly tenant: LabTenantId;
  readonly value: T;
  readonly updatedAt: number;
  readonly snapshot: string;
};

export interface ScenarioRepository {
  saveScenario(scenario: LabScenario): Promise<void>;
  loadScenario(tenant: string, scenarioId: string): Promise<LabScenario | null>;
  listScenarios(tenant: string): Promise<readonly LabScenario[]>;
}

export interface PlanRepository {
  savePlan(plan: LabPlanTemplate): Promise<void>;
  getPlan(tenant: string, scenarioId: string): Promise<LabPlanTemplate | null>;
  listPlans(tenant: string): Promise<readonly LabPlanTemplate[]>;
}

export interface RunRepository {
  appendRun(run: LabExecution): Promise<void>;
  getRun(tenant: string, executionId: string): Promise<LabExecution | null>;
  listRuns(tenant: string): Promise<readonly LabExecution[]>;
}

export interface ResultRepository {
  saveResult(result: LabExecutionResult): Promise<void>;
  getResult(tenant: string, executionId: string): Promise<LabExecutionResult | null>;
  listResults(tenant: string): Promise<readonly LabExecutionResult[]>;
}

export interface TelemetryRepository {
  saveTelemetry(telemetry: LabTelemetry): Promise<void>;
  queryTelemetry(tenant: string): Promise<readonly LabTelemetry[]>;
}

export interface RecoveryLabStore {
  scenarios: ScenarioRepository;
  plans: PlanRepository;
  runs: RunRepository;
  results: ResultRepository;
  telemetry: TelemetryRepository;
  queryStore(filters: StoreFilters): Promise<StoreSnapshot>;
}

export interface StoreFilters {
  readonly tenant: string;
  readonly query?: string;
  readonly since?: number;
}

export interface StoreSnapshot {
  readonly tenant: LabTenantId;
  readonly scenarios: readonly LabScenario[];
  readonly plans: readonly LabPlanTemplate[];
  readonly runIds: readonly string[];
}

export const buildEmptySnapshot = (tenant: string): StoreSnapshot => ({
  tenant: asLabTenantId(tenant),
  scenarios: [],
  plans: [],
  runIds: [],
});

export const asStoreId = (tenant: string, runId: string): string => `${asLabTenantId(tenant)}:${asLabRunId(runId)}`;
export const asTenantFilter = (tenant: string): StoreRecord<number> => {
  const now = Date.now();
  return {
    id: asStoreId(tenant, `${tenant}-${now}`),
    tenant: asLabTenantId(tenant),
    value: now,
    updatedAt: now,
    snapshot: `${tenant}:${String(now)}`,
  };
};
