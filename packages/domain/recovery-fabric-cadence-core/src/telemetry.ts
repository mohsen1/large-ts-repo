import type { CadenceForecast, CadencePlan, FabricHealth, FabricRunSnapshot, FabricNodeId, CadenceExecutionMode } from './types';

export interface CadenceTelemetrySnapshot {
  readonly planId: CadencePlan['planId'];
  readonly signalCount: number;
  readonly windowCount: number;
  readonly avgSpanMs: number;
  readonly progress: number;
}

const spanMs = (startIso: string, endIso: string): number =>
  new Date(endIso).getTime() - new Date(startIso).getTime();

export const buildTelemetrySnapshot = (plan: CadencePlan): CadenceTelemetrySnapshot => {
  const spans = plan.windows.map((window) => spanMs(window.startIso, window.endIso));
  const avgSpanMs = spans.length > 0 ? spans.reduce((acc, value) => acc + value, 0) / spans.length : 0;
  return {
    planId: plan.planId,
    signalCount: plan.nodeOrder.length,
    windowCount: plan.windows.length,
    avgSpanMs,
    progress: plan.windows.length > 0 ? plan.nodeOrder.length / plan.windows.length : 0,
  };
};

export const buildForecastFromPlan = (plan: CadencePlan): CadenceForecast => {
  const telemetry = buildTelemetrySnapshot(plan);
  const confidence = Math.min(1, Math.max(0.05, Math.min(telemetry.progress, 1)));
  const trend: CadenceForecast['trend'] = confidence > 0.8 ? 'up' : confidence > 0.3 ? 'flat' : 'down';

  return {
    planId: plan.planId,
    trend,
    expectedDurationMs: telemetry.avgSpanMs * Math.max(1, plan.windows.length),
    confidence,
    riskCurve: plan.windows.map((window, index) => ({
      at: window.startIso,
      risk: Math.min(1, (index + 1) / Math.max(1, plan.windows.length)),
    })),
  };
};

const toNodeId = (windowId: CadencePlan['windows'][number]['windowId']): FabricNodeId => {
  const parts = windowId.split(':');
  const target = parts[1] ?? 'window';
  const candidate = `node:${target}`;
  return candidate as FabricNodeId;
};

export const evaluateHealth = (
  snapshot: FabricRunSnapshot,
  mode: CadenceExecutionMode = 'stitch',
): FabricHealth => {
  const signalCoverage = snapshot.signalCount === 0 ? 0 : snapshot.throughput / Math.max(1, snapshot.signalCount);
  return {
    signalCoverage,
    riskBand: signalCoverage > 0.7 ? 'green' : signalCoverage > 0.35 ? 'amber' : 'red',
    overloadedNodes: snapshot.completedWindows.map((windowId) => toNodeId(windowId)),
    blockedDependencies: mode === 'burst'
      ? [{ from: 'node:catalog-a', to: 'node:catalog-b', reason: 'capacity' }]
      : [],
  };
};
