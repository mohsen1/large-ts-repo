import type { CommandNetworkSnapshot, ValidationReport, PolicyRule } from '@domain/recovery-command-network';
import { validateSnapshot, summarizeDecisions } from '@domain/recovery-command-network';

export interface CommandNetworkHealthData {
  readonly snapshotId: string;
  readonly score: number;
  readonly issues: number;
  readonly status: 'healthy' | 'warn' | 'degraded';
  readonly policySummary: string;
}

export interface HealthRecord {
  readonly at: string;
  readonly score: number;
  readonly status: CommandNetworkHealthData['status'];
}

const scoreToStatus = (score: number): CommandNetworkHealthData['status'] => {
  if (score >= 0.85) {
    return 'healthy';
  }
  if (score >= 0.6) {
    return 'warn';
  }
  return 'degraded';
};

export const evaluateHealth = (snapshot: CommandNetworkSnapshot): CommandNetworkHealthData => {
  const report: ValidationReport = validateSnapshot(snapshot);
  const policySummary = snapshot.policies.map((policy) => policy.name).join(', ');
  return {
    snapshotId: report.snapshotId,
    score: report.score,
    issues: report.issues.length,
    status: scoreToStatus(report.score),
    policySummary,
  };
};

export const aggregatePolicyHealth = (policies: readonly PolicyRule[]): Record<string, number> =>
  policies.reduce((acc, policy) => ({
    ...acc,
    [policy.policyId]: policy.maxLatencyMs,
  }), {} as Record<string, number>);

export const compactHealthTrend = (history: readonly HealthRecord[]) => history.map((entry) => `${entry.at}:${entry.score.toFixed(2)}:${entry.status}`).join(' | ');

export const computePolicyPressureHint = (snapshot: CommandNetworkSnapshot): number => {
  const edgesHealthy = snapshot.edges.filter((edge) => edge.meta.errorRatePercent < 3 && edge.confidence > 0.7).length;
  return Math.max(0, 1 - edgesHealthy / Math.max(1, snapshot.edges.length));
};

export const buildHealthRecord = (snapshot: CommandNetworkSnapshot, decisions: unknown[]) => ({
  at: new Date().toISOString(),
  score: validateSnapshot(snapshot).score,
  status: scoreToStatus(validateSnapshot(snapshot).score),
  decisions: summarizeDecisions(decisions as any).acceptedCount,
});
