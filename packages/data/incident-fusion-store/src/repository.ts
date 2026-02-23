import { InMemoryFusionStore } from './in-memory-cache';
import type { IncidentFusionStore, QueryFilter, ReadThroughput } from './types';
import type { RecoveryScenario, RecoverySignal, RecoveryAction, FusionSimulation, FusionPlan, SignalEnvelope } from '@domain/incident-fusion-models';

export interface FusionRepositoryConfig {
  readonly tenant: string;
  readonly memoryBudget?: number;
}

export class IncidentFusionRepository implements IncidentFusionStore {
  private readonly delegate: InMemoryFusionStore;

  constructor(private readonly config: FusionRepositoryConfig) {
    this.delegate = new InMemoryFusionStore();
  }

  async saveSignal(_tenant: string, signal: RecoverySignal): Promise<void> {
    await this.delegate.saveSignal(this.config.tenant, signal);
  }

  async saveScenario(_tenant: string, scenario: RecoveryScenario): Promise<void> {
    await this.delegate.saveScenario(this.config.tenant, scenario);
  }

  async saveAction(_tenant: string, action: RecoveryAction): Promise<void> {
    await this.delegate.saveAction(this.config.tenant, action);
  }

  async saveSimulation(_tenant: string, simulation: FusionSimulation): Promise<void> {
    await this.delegate.saveSimulation(this.config.tenant, simulation);
  }

  async savePlan(_tenant: string, plan: FusionPlan): Promise<void> {
    await this.delegate.savePlan(this.config.tenant, plan);
  }

  async listSignals(filter: QueryFilter): Promise<readonly RecoverySignal[]> {
    return this.delegate.listSignals({ ...filter, tenant: filter.tenant ?? this.config.tenant });
  }

  async listScenarios(filter: QueryFilter): Promise<readonly RecoveryScenario[]> {
    return this.delegate.listScenarios({ ...filter, tenant: filter.tenant ?? this.config.tenant });
  }

  async listActions(filter: QueryFilter): Promise<readonly RecoveryAction[]> {
    return this.delegate.listActions({ ...filter, tenant: filter.tenant ?? this.config.tenant });
  }

  async listSimulations(filter: QueryFilter): Promise<readonly FusionSimulation[]> {
    return this.delegate.listSimulations({ ...filter, tenant: filter.tenant ?? this.config.tenant });
  }

  async listPlans(filter: QueryFilter): Promise<readonly FusionPlan[]> {
    return this.delegate.listPlans({ ...filter, tenant: filter.tenant ?? this.config.tenant });
  }

  async getThroughput(tenant: string, scenarioId: RecoveryScenario['id']): Promise<ReadThroughput> {
    return this.delegate.getThroughput(tenant, scenarioId);
  }

  async snapshot(tenant: string): Promise<readonly SignalEnvelope<RecoverySignal>[] | null> {
    return this.delegate.snapshot(tenant);
  }
}

export const createFusionRepository = (config: FusionRepositoryConfig): IncidentFusionStore => {
  return new IncidentFusionRepository(config);
};
