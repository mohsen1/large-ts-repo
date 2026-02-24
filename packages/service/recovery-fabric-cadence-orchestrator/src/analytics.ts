import type {
  CadenceForecast,
  CadencePlan,
  CadenceWorkspaceState,
  FabricHealth,
  FabricRunSnapshot,
} from '@domain/recovery-fabric-cadence-core';
import { buildForecastFromPlan, buildTelemetrySnapshot, evaluateHealth } from '@domain/recovery-fabric-cadence-core';
import type { OrchestrationOutcome } from './types';

export interface OrchestratorAnalytics {
  readonly workspaceId: string;
  readonly runCount: number;
  readonly averageRunDurationMs: number;
  readonly riskTrend: readonly number[];
  readonly pathSignature: string;
  readonly riskBand: FabricHealth['riskBand'];
}

export const summarizeRun = (run: FabricRunSnapshot): { riskBand: FabricHealth['riskBand']; score: number } => {
  const score = Math.max(0, Math.min(1, run.throughput / Math.max(1, run.signalCount)));
  const band = score > 0.66 ? 'green' : score > 0.33 ? 'amber' : 'red';
  return { riskBand: band, score };
};

export const summarizeOutcome = (outcome: OrchestrationOutcome): OrchestratorAnalytics => {
  const snapshot = outcome.snapshot;
  const averageRunDurationMs = snapshot ? 60_000 + snapshot.completedWindows.length * 12_000 : 0;
  const riskTrend = snapshot
    ? snapshot.completedWindows.map((_, index) => ((index + 1) / Math.max(1, snapshot.completedWindows.length)) * 10)
    : [];
  const pathSignature = outcome.plan ? formatCadencePath(outcome.plan) : 'none';

  return {
    workspaceId: outcome.workspaceId,
    runCount: snapshot ? snapshot.completedWindows.length : 0,
    averageRunDurationMs,
    riskTrend,
    pathSignature,
    riskBand: snapshot ? summarizeRun(snapshot).riskBand : 'green',
  };
};

export const formatCadencePath = (plan: CadencePlan): string => {
  const signature = plan.windows.map((window) => `${window.windowId}:${window.requestedMode}`).join('|');
  return `${signature}::${plan.nodeOrder.join('>')}`;
};

export const telemetrySnapshot = (state: CadenceWorkspaceState, plan: CadencePlan) => {
  const telemetry = buildTelemetrySnapshot(plan);
  const forecast: CadenceForecast = buildForecastFromPlan(plan);
  const health = evaluateHealth(
    {
      runId: `run:${plan.planId}` as const,
      planId: plan.planId,
      startedAt: new Date().toISOString(),
      expectedEndAt: new Date(Date.now() + telemetry.avgSpanMs * Math.max(1, telemetry.windowCount)).toISOString(),
      signalCount: telemetry.signalCount,
      throughput: telemetry.progress,
      completedWindows: [],
    },
    plan.metadata.mode,
  );

  return {
    planId: telemetry.planId,
    telemetry,
    forecast,
    path: formatCadencePath(plan),
    workspaceId: state.workspaceId,
    riskBand: health.riskBand,
    signalCoverage: health.signalCoverage,
  };
};
