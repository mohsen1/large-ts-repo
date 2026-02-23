import { type AlertSignal } from '@domain/recovery-ops-fabric';
import { RecoveryOpsFabricStore } from '@data/recovery-ops-fabric-store';

export interface HealthSnapshot {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly risk: number;
  readonly criticalSignals: number;
}

export const aggregateFacilitySignals = (signals: readonly AlertSignal[]): Record<string, AlertSignal[]> => {
  const out: Record<string, AlertSignal[]> = {};
  for (const signal of signals) {
    const bucket = out[signal.facilityId] ?? [];
    bucket.push(signal);
    out[signal.facilityId] = bucket;
  }
  return out;
};

export const mapSummaryByFacility = (signals: readonly AlertSignal[]): Record<string, number> => {
  const byFacility = aggregateFacilitySignals(signals);
  const out: Record<string, number> = {};

  for (const [facilityId, facilitySignals] of Object.entries(byFacility)) {
    out[facilityId] = facilitySignals.reduce((acc, signal) => acc + (signal.value - signal.baseline), 0);
  }

  return out;
};

export const buildSnapshots = (
  store: RecoveryOpsFabricStore,
  facilityId: string,
): HealthSnapshot[] => {
  const all = store
    .allSimulationRuns()
    .flatMap((simulation) => simulation.runId ? [{ ...simulation, facilityId }] : []);
  return all.map((simulation) => ({
    tenantId: simulation.runId.split('-')[1] ?? 'unknown',
    facilityId,
    risk: simulation.riskScore,
    criticalSignals: simulation.recommendationCount,
  }));
};

export const composeHealthStream = (snapshots: HealthSnapshot[]): string => {
  return JSON.stringify({
    count: snapshots.length,
    averageRisk: snapshots.length
      ? Number((snapshots.reduce((acc, snapshot) => acc + snapshot.risk, 0) / snapshots.length).toFixed(4))
      : 0,
    generatedAt: new Date().toISOString(),
    snapshots,
  });
};
