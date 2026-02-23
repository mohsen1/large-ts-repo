import type { RecoveryScenario, RecoverySignal, RecoveryAction, FusionSimulation, FusionPlan, SignalEnvelope } from '@domain/incident-fusion-models';

export type QueryByTenant = { readonly tenant: string };
export type QueryByScenario = { readonly scenarioId: RecoveryScenario['id'] };
export type QueryBySignal = { readonly signalId: RecoverySignal['id'] };

export interface ReadThroughput {
  readonly scenarioId: RecoveryScenario['id'];
  readonly tenant: string;
  readonly totalRuns: number;
  readonly medianMinutes: number;
  readonly failureRate: number;
  readonly lastRunAt?: string;
}

export interface PersistedSimulation {
  readonly tenant: string;
  readonly simulation: FusionSimulation;
  readonly ttlMs: number;
}

export interface PersistedPlan {
  readonly tenant: string;
  readonly plan: FusionPlan;
  readonly ttlMs: number;
}

export interface QueryFilter {
  readonly tenant?: string;
  readonly scenarioId?: RecoveryScenario['id'];
  readonly signalId?: RecoverySignal['id'];
  readonly actionId?: RecoveryAction['id'];
  readonly from?: string;
  readonly to?: string;
}

export interface IncidentFusionStore {
  saveSignal(tenant: string, signal: RecoverySignal): Promise<void>;
  saveScenario(tenant: string, scenario: RecoveryScenario): Promise<void>;
  saveAction(tenant: string, action: RecoveryAction): Promise<void>;
  saveSimulation(tenant: string, simulation: FusionSimulation): Promise<void>;
  savePlan(tenant: string, plan: FusionPlan): Promise<void>;
  listSignals(filter: QueryFilter): Promise<readonly RecoverySignal[]>;
  listScenarios(filter: QueryFilter): Promise<readonly RecoveryScenario[]>;
  listActions(filter: QueryFilter): Promise<readonly RecoveryAction[]>;
  listSimulations(filter: QueryFilter): Promise<readonly FusionSimulation[]>;
  listPlans(filter: QueryFilter): Promise<readonly FusionPlan[]>;
  getThroughput(tenant: string, scenarioId: RecoveryScenario['id']): Promise<ReadThroughput>;
  snapshot(tenant: string): Promise<readonly SignalEnvelope<RecoverySignal>[] | null>;
}
