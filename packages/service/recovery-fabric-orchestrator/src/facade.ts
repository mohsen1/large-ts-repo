import { RecoveryOpsFabricStore } from '@data/recovery-ops-fabric-store';
import { createEngine, type FabricEngine } from './engine';
import {
  type FabricSimulationInput,
  type PlannerOptions,
  type PlannerResult,
  type AlertSignal,
  type SimulationRunbook,
  type FabricRunId,
  simulateSignalReplay,
} from '@domain/recovery-ops-fabric';
import {
  filterByConfidence,
  pickSafeRuns,
  aggregateFacilityPlanCount,
} from '@data/recovery-ops-fabric-store';
import { mapSummaryByFacility } from './telemetry';

export interface RecoveryOpsFabricFacade {
  executeTopology(input: FabricSimulationInput, options: PlannerOptions): PlannerResult;
  replayTopology(input: FabricSimulationInput): SimulationRunbook;
  safeReplays(signals: readonly AlertSignal[], runId: string): SimulationRunbook[];
}

export class RecoveryOpsFabricFacadeImpl implements RecoveryOpsFabricFacade {
  private readonly engine: FabricEngine;

  constructor(private readonly store: RecoveryOpsFabricStore, engine?: FabricEngine) {
    this.engine =
      engine ??
      createEngine(store, {
        tenantId: 'tenant-fabric' as any,
        facilityId: 'facility-0' as any,
        topology: {
          tenantId: 'tenant-fabric' as any,
          nodes: [],
          edges: [],
          profiles: [],
        },
        signals: [],
        constraint: { maxSkewMs: 500, maxRisk: 0.3, minHeadroom: 0.1 },
        baselineDemand: 0,
        targetReliability: 0.95,
      });
  }

  executeTopology(input: FabricSimulationInput, options: PlannerOptions): PlannerResult {
    return this.engine.run(input, options);
  }

  replayTopology(input: FabricSimulationInput): SimulationRunbook {
    const runbook = simulateSignalReplay(input);
    const brandedRunId = runbook.runId as FabricRunId;
    this.store.saveSimulation({
      runId: brandedRunId,
      stress: 0,
      riskScore: 0,
      recommendationCount: 0,
      plan: {
        runId: brandedRunId,
        tenantId: input.tenantId,
        createdAt: new Date().toISOString(),
        horizonMinutes: 10,
        constraint: { maxSkewMs: 300, maxRisk: 0.3, minHeadroom: 0.1 },
        steps: [],
        commandsQueued: 0,
        confidence: 0.5,
      },
      confidence: 0.5,
    });
    return runbook;
  }

  safeReplays(signals: readonly AlertSignal[], runId: string): SimulationRunbook[] {
    const facilityMap = mapSummaryByFacility(signals);
    const facilities = Object.entries(facilityMap);
    const runs = this.store.allSimulationRuns();
    const safeRuns = pickSafeRuns(runs, { maxSkewMs: 300, maxRisk: 0.6, minHeadroom: 0.1 });
    const filtered = filterByConfidence(runs, Math.max(0.2, safeRuns.reduce((acc, run) => Math.max(acc, run.confidence), 0)));

    const summaries = aggregateFacilityPlanCount(this.store, facilities.map(([facilityId]) => facilityId));
    return facilities.map(([facilityId]) => ({
      runId: `${runId}:${facilityId}`,
      points: [
        {
          timestamp: new Date().toISOString(),
          stressScore: filtered.length,
          riskScore: Math.max(0.1, 1 - filtered.length * 0.1),
        },
      ],
      notes: ['simulated safe runbook'],
      planSummary: {
        facility: facilityId,
        signalCount: summaries[facilityId] ?? 0,
        safeRuns: filtered.length,
      },
    }));
  }
}

export const createFacade = (): RecoveryOpsFabricFacadeImpl => new RecoveryOpsFabricFacadeImpl(new RecoveryOpsFabricStore(), undefined);
