import { RecoverySimulationResult, OrchestrationPlan, TenantId } from './models';
import { compareSimulations } from './simulation';

export interface StressLabAdapter {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly ping: () => Promise<string>;
}

export interface StressLabPersistence {
  loadPlan(tenantId: TenantId): Promise<OrchestrationPlan | null>;
  savePlan(tenantId: TenantId, plan: OrchestrationPlan): Promise<void>;
  loadSimulation(tenantId: TenantId): Promise<RecoverySimulationResult | null>;
  saveSimulation(tenantId: TenantId, simulation: RecoverySimulationResult): Promise<void>;
}

export interface StressLabAuditSink {
  emit(event: string, payload: unknown): Promise<void>;
}

export interface StressLabRuntimeClock {
  now(): string;
}

export type SimulationHistoryEntry = {
  tenantId: TenantId;
  plan: OrchestrationPlan | null;
  simulation: RecoverySimulationResult;
  createdAt: string;
};

export class InMemoryPersistence implements StressLabPersistence {
  private readonly planByTenant = new Map<string, OrchestrationPlan>();
  private readonly simulationByTenant = new Map<string, RecoverySimulationResult>();

  async loadPlan(tenantId: TenantId): Promise<OrchestrationPlan | null> {
    return this.planByTenant.get(tenantId) ?? null;
  }

  async savePlan(tenantId: TenantId, plan: OrchestrationPlan): Promise<void> {
    this.planByTenant.set(tenantId, plan);
  }

  async loadSimulation(tenantId: TenantId): Promise<RecoverySimulationResult | null> {
    return this.simulationByTenant.get(tenantId) ?? null;
  }

  async saveSimulation(tenantId: TenantId, simulation: RecoverySimulationResult): Promise<void> {
    this.simulationByTenant.set(tenantId, simulation);
  }
}

export class ConsoleAuditSink implements StressLabAuditSink {
  async emit(event: string, payload: unknown): Promise<void> {
    const body = JSON.stringify(payload);
    console.log(`[stress-lab] ${event}: ${body}`);
  }
}

export class SystemClock implements StressLabRuntimeClock {
  now(): string {
    return new Date().toISOString();
  }
}

export const detectPlanDrift = (
  persisted: RecoverySimulationResult | null,
  incoming: RecoverySimulationResult,
): boolean => {
  if (!persisted) return false;
  const diagnostics = compareSimulations(persisted, incoming);
  return diagnostics.length > 0;
};

export const buildHistory = (tenantId: TenantId, plan: OrchestrationPlan | null, simulation: RecoverySimulationResult): SimulationHistoryEntry => {
  return {
    tenantId,
    plan,
    simulation,
    createdAt: new Date().toISOString(),
  };
};
