import { RecoveryOpsFabricStore } from './store';
import { type FabricSimulationResult, type FabricConstraint } from '@domain/recovery-ops-fabric';

export interface FabricQuery {
  readonly facilityId?: string;
  readonly minConfidence?: number;
  readonly maxRisk?: number;
}

export interface FabricQueryResult {
  readonly runId: string;
  readonly confidence: number;
  readonly stress: number;
  readonly riskScore: number;
}

export const filterByConfidence = (runs: readonly FabricSimulationResult[], minConfidence: number): FabricQueryResult[] =>
  runs
    .filter((run) => run.confidence >= minConfidence)
    .map((run) => ({
      runId: run.runId,
      confidence: run.confidence,
      stress: run.stress,
      riskScore: run.riskScore,
    }));

export const filterByRisk = (runs: readonly FabricSimulationResult[], maxRisk: number): FabricQueryResult[] =>
  runs
    .filter((run) => run.riskScore <= maxRisk)
    .map((run) => ({
      runId: run.runId,
      confidence: run.confidence,
      stress: run.stress,
      riskScore: run.riskScore,
    }));

export const aggregateFacilityPlanCount = (store: RecoveryOpsFabricStore, facilities: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const facilityId of facilities) {
    out[facilityId] = store.getSignals(facilityId as any).length;
  }
  return out;
}

export const pickSafeRuns = (
  runs: readonly FabricSimulationResult[],
  constraint: FabricConstraint,
): FabricQueryResult[] => {
  const byConfidence = filterByConfidence(runs, 0.5).filter((run) => run.riskScore <= constraint.maxRisk);
  if (byConfidence.length === 0) {
    return filterByRisk(runs, constraint.maxRisk + 0.2).sort((left, right) => right.confidence - left.confidence);
  }
  return byConfidence.sort((left, right) => right.confidence - left.confidence);
};
