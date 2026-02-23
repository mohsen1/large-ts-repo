import type { SignalStore } from '@data/recovery-signal-intelligence-store';
import type { SignalFeedSnapshot } from '@domain/recovery-signal-intelligence';
import { snapshotMetrics, topFacilitiesByRisk } from '@domain/recovery-signal-intelligence';

export interface SignalTelemetry {
  topDimension: string;
  avgDrift: number;
  criticalCount: number;
  facilityCount: number;
  topRiskFacilities: string[];
  totalPlans: number;
  totalCommands: number;
}

export const telemetry = (snapshot: SignalFeedSnapshot): SignalTelemetry => {
  const metrics = snapshotMetrics(snapshot);
  return {
    topDimension: metrics.topDimension,
    avgDrift: metrics.avgDrift,
    criticalCount: metrics.criticalCount,
    facilityCount: metrics.facilityCount,
    topRiskFacilities: topFacilitiesByRisk(snapshot),
    totalPlans: snapshot.pulses.length,
    totalCommands: snapshot.priorities.length,
  };
};

export const buildSignalPulseSummary = (bundleId: string, store: SignalStore) => {
  const snapshotResult = store.getLatestSnapshot(bundleId);
  if (!snapshotResult.ok) {
    return { planCount: 0, commandCount: 0, bundles: 0 };
  }

  const snapshot = snapshotResult.value;
  const plansForTenant = store.listPlans().filter((plan) => plan.tenantId === snapshot.tenantId);
  const commandsForTenant = store
    .listCommands(snapshot.tenantId)
    .filter((command) => command.tenantId === snapshot.tenantId);

  return {
    planCount: plansForTenant.length,
    commandCount: commandsForTenant.length,
    bundles: 1,
  };
};
