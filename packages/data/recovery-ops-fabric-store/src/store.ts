import { ok, fail } from '@shared/result';
import { type FabricSimulationResult, type FabricPlan, type FabricRunId, type AlertSignal, type FacilityId } from '@domain/recovery-ops-fabric';

export interface FabricStoreRecord {
  readonly runId: FabricRunId;
  readonly plan: FabricPlan;
  readonly signalCount: number;
}

export class RecoveryOpsFabricStore {
  private readonly plans = new Map<string, FabricPlan>();
  private readonly simulations = new Map<string, FabricSimulationResult>();
  private readonly signalIndex = new Map<string, AlertSignal[]>();

  savePlan(plan: FabricPlan): void {
    this.plans.set(plan.runId, plan);
  }

  saveSimulation(simulation: FabricSimulationResult): void {
    this.simulations.set(simulation.runId, simulation);
    this.plans.set(simulation.plan.runId, simulation.plan);
  }

  getPlan(runId: FabricRunId): ReturnType<typeof ok<FabricPlan>> | ReturnType<typeof fail<Error>> {
    const plan = this.plans.get(runId);
    if (!plan) {
      return fail(new Error(`missing plan ${runId}`));
    }
    return ok(plan);
  }

  listPlanHistory(): ReadonlyArray<FabricStoreRecord> {
    return Array.from(this.plans.values()).map((plan) => ({
      runId: plan.runId,
      plan,
      signalCount: plan.steps.length,
    }));
  }

  upsertSignal(signal: AlertSignal): void {
    const facilitySignals = this.signalIndex.get(signal.facilityId) ?? [];
    facilitySignals.push(signal);
    this.signalIndex.set(signal.facilityId, facilitySignals);
  }

  getSignals(facilityId: FacilityId): AlertSignal[] {
    return this.signalIndex.get(facilityId) ?? [];
  }

  latestPlanForFacility(facilityId: string): ReturnType<typeof ok<FabricPlan>> | ReturnType<typeof fail<Error>> {
    for (const plan of this.plans.values()) {
      const maybe = plan.steps.find((step) => step.nodeId.includes(facilityId));
      if (maybe) {
        return ok(plan);
      }
    }
    return fail(new Error(`no plan for facility ${facilityId}`));
  }

  allSimulationRuns(): ReadonlyArray<FabricSimulationResult> {
    return Array.from(this.simulations.values());
  }
}
