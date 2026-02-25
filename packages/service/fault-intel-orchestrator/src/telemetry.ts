import type { IncidentSignal, CampaignRunResult } from '@domain/fault-intel-orchestration';
import type { CampaignStoreSummary } from '@data/fault-intel-store';

export interface OrchestratorTelemetry {
  readonly planId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly signalCount: number;
  readonly averageSignalScore: number;
  readonly pluginCount: number;
}

export interface TelemetrySnapshot {
  readonly eventName: string;
  readonly durationMs: number;
  readonly metrics: Record<string, number>;
}

export const computeSignalDensity = (signals: readonly IncidentSignal[]): number =>
  signals.length === 0 ? 0 : signals.reduce((acc, signal) => acc + signal.metrics.length, 0) / signals.length;

export const computeRunSummary = (run: CampaignRunResult): OrchestratorTelemetry => {
  const severityScore = run.signals.reduce((acc, signal) => {
    if (signal.severity === 'critical') {
      return acc + 8;
    }
    if (signal.severity === 'warning') {
      return acc + 4;
    }
    if (signal.severity === 'advisory') {
      return acc + 2;
    }
    return acc + 1;
  }, 0);
  const averageSignalScore = run.signals.length === 0 ? 0 : severityScore / run.signals.length;

  return {
    planId: run.planId,
    tenantId: run.campaign.tenantId,
    workspaceId: run.campaign.workspaceId,
    signalCount: run.signals.length,
    averageSignalScore,
    pluginCount: run.policy.requiredStages.length,
  };
};

export const telemetryEnvelope = (
  eventName: string,
  durationMs: number,
  summary: CampaignStoreSummary,
): TelemetrySnapshot => ({
  eventName,
  durationMs,
  metrics: {
    totalRisk: summary.riskAverage,
    templates: summary.templateCount,
    runs: summary.runCount,
  },
});
