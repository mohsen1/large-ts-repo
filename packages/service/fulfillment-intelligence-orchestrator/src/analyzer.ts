import { Result, fail, ok } from '@shared/result';
import { summarizeMetricSet, rankScenariosByRisk, recommendInterventions } from '@domain/fulfillment-orchestration-analytics';
import { rankByScore } from '@shared/util';
import { ForecastPlan, ForecastWindow, WorkloadScenario, DemandSignal } from '@domain/fulfillment-orchestration-analytics';
import { InMemoryFulfillmentTelemetryStore } from '@data/fulfillment-telemetry-store';
import { buildThroughputSummary } from '@data/fulfillment-telemetry-store';
import { OrchestrationResult } from './types';

export interface Snapshot {
  tenantId: string;
  runId: string;
  plan: string;
  alerts: readonly string[];
  trend: readonly number[];
}

export const classifyRisk = (plan: ForecastPlan): 'low' | 'medium' | 'high' | 'critical' => {
  const score = aggregatePlanScore(plan.scenario.windows, plan.slaTargets.length);
  if (score > 75) return 'critical';
  if (score > 50) return 'high';
  if (score > 25) return 'medium';
  return 'low';
};

export const makeSignalsForSignals = (signals: readonly DemandSignal[]): string =>
  signals
    .map((signal) => `${signal.productId}:${signal.sku}:${signal.confidence.toFixed(2)}`)
    .join('|');

export const deriveInterventions = (plan: ForecastPlan): readonly string[] => {
  const metrics = plan.scenario.windows.map((window) => ({ scenarioId: plan.scenario.id, predictedBacklog: window.forecastUnits * window.backlogRisk, predictedSlaLoss: window.backlogRisk * 0.4, riskScore: window.backlogRisk * 100, utilization: window.forecastUnits * 1.2 }));
  const ranked = rankScenariosByRisk([...metrics]);
  return recommendInterventions(ranked);
};

export const summarizeResult = (result: OrchestrationResult): string =>
  `${result.runId} ${result.status} score=${result.score.toFixed(2)} plan=${result.plan.planId} scenario=${result.topScenario?.id ?? 'none'}`;

export const buildSnapshot = async (
  runId: string,
  tenantId: string,
  plan: ForecastPlan,
  telemetry: InMemoryFulfillmentTelemetryStore,
): Promise<Result<Snapshot>> => {
  const history = await telemetry.getRun(runId);
  if (!history.ok) {
    return fail(history.error as Error);
  }
  const historyItem = history.value;
  if (!historyItem) {
    return fail(new Error('missing telemetry history'));
  }
  const alerts = historyItem.alerts.map((alert) => alert.message);
  const trend = historyItem.windows.map((window) => window.workerUtilization);
  const throughput = buildThroughputSummary(historyItem.windows);
  return ok<Snapshot>({
    tenantId,
    runId,
    plan: summarizeMetricSet(plan),
    alerts,
    trend: throughput.byWindow.map((item) => item.utilization),
  });
};

export const aggregatePlanScore = (windows: readonly ForecastWindow[], targetSla: number): number => {
  const risks = windows.map((window) => window.backlogRisk * 100);
  const sorted = rankByScore(risks.map((value) => ({ value })), (value) => value.value).map((entry) => entry.value);
  const averageRisk = risks.length ? risks.reduce((acc, value) => acc + value, 0) / risks.length : 0;
  return Number(((1 - averageRisk / 100) * targetSla + sorted[sorted.length - 1]).toFixed(2));
};
