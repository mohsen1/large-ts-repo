import { rankByScore, movingAverage, toPercent } from '@shared/util';
import { ForecastPlan, ForecastWindow, WorkloadScenario } from './models';

export interface ThroughputMetric {
  tenantId: string;
  lane: string;
  plannedRate: number;
  actualRate: number;
  efficiency: number;
  deviationPercent: number;
}

export interface ThroughputSeries {
  tenantId: string;
  points: readonly ThroughputMetric[];
}

export interface ScenarioMetricView {
  scenarioId: string;
  predictedBacklog: number;
  predictedSlaLoss: number;
  riskScore: number;
  utilization: number;
}

export interface SimulationProfile {
  name: string;
  throughput: ThroughputSeries;
  riskTrend: readonly number[];
  confidenceTrend: readonly number[];
}

export const buildThroughput = (
  tenantId: string,
  lane: string,
  signalValues: readonly { baseDemand: number; observedDemand: number; seasonalFactor: number }[],
): ThroughputSeries => {
  const points = signalValues.map((signal) => {
    const plannedRate = signal.baseDemand + 1;
    const actualRate = signal.observedDemand + signal.seasonalFactor * 5;
    const deviation = actualRate - plannedRate;
    const deviationPercent = toPercent(deviation, plannedRate);
    const efficiency = clamp(100 - Math.abs(deviationPercent), 0, 100);
    return {
      tenantId,
      lane,
      plannedRate,
      actualRate,
      efficiency,
      deviationPercent: Number(deviationPercent.toFixed(2)),
    };
  });

  return { tenantId, points };
};

export const riskSeriesFromWindows = (windows: readonly ForecastWindow[]): readonly number[] => {
  const raw = windows.map((window) => window.backlogRisk * 100);
  return movingAverage(raw, 5);
};

export const confidenceFromWindows = (windows: readonly ForecastWindow[]): readonly number[] =>
  windows.map((window) => Number((window.confidence * 100).toFixed(2)));

export const scenarioToMetric = (scenario: WorkloadScenario, windows: readonly ForecastWindow[]): ScenarioMetricView => {
  const predictedBacklog = windows.reduce((acc, window) => acc + window.forecastUnits * window.backlogRisk, 0);
  const averageConfidence = windows.reduce((acc, window) => acc + window.confidence, 0) / Math.max(1, windows.length);
  const predictedSlaLoss = Math.max(0, 100 - predictedBacklog / Math.max(1, scenario.score));
  return {
    scenarioId: scenario.id,
    predictedBacklog,
    predictedSlaLoss: Number(predictedSlaLoss.toFixed(2)),
    riskScore: Number(aggregateWindowRisk(windows).toFixed(2)),
    utilization: Number((scenario.score * averageConfidence).toFixed(2)),
  };
};

export const summarizeMetricSet = (plan: ForecastPlan): string => {
  const throughput = plan.windows.reduce((acc, window) => acc + window.forecastUnits, 0);
  const risk = aggregateWindowRisk(plan.windows);
  const strategyList = plan.selectedStrategies.join(', ');
  return `${plan.tenantId}: ${throughput.toFixed(1)} units, risk ${risk.toFixed(2)}, strategy ${strategyList}`;
};

export const rankScenariosByRisk = (scenarios: readonly ScenarioMetricView[]): readonly ScenarioMetricView[] =>
  [...scenarios].sort((left, right) => left.riskScore - right.riskScore);

export const rankByStressSignal = (candidates: readonly WorkloadScenario[]): readonly WorkloadScenario[] =>
  rankByScore(candidates, (candidate) => candidate.score);

export const composeSimulationProfile = (
  name: string,
  tenantId: string,
  signals: readonly { baseDemand: number; observedDemand: number; seasonalFactor: number }[],
  planWindows: readonly ForecastWindow[],
): SimulationProfile => {
  const throughput = buildThroughput(tenantId, 'fulfillment', signals);
  const sortedWindows = [...planWindows].sort((left, right) => Date.parse(left.slotStart) - Date.parse(right.slotStart));
  return {
    name,
    throughput,
    riskTrend: riskSeriesFromWindows(sortedWindows),
    confidenceTrend: confidenceFromWindows(sortedWindows),
  };
};

export const recommendInterventions = (metrics: readonly ScenarioMetricView[]): readonly string[] => {
  const ranked = rankScenariosByRisk(metrics);
  return ranked.map((metric) => {
    if (metric.riskScore > 70) return `scale-up-${metric.scenarioId}`;
    if (metric.predictedSlaLoss > 10) return `rebalance-${metric.scenarioId}`;
    return `monitor-${metric.scenarioId}`;
  });
};

export const calculateEfficiency = (actual: number, expected: number): number => {
  if (expected === 0) return 0;
  return Number(((actual / expected) * 100).toFixed(2));
};

const aggregateWindowRisk = (windows: readonly ForecastWindow[]): number => {
  if (windows.length === 0) return 0;
  const risks = windows.map((window) => Math.max(0, Math.min(1000, window.backlogRisk * 100)));
  return Number((risks.reduce((acc, risk) => acc + risk, 0) / risks.length).toFixed(2));
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return Number(value.toFixed(3));
};
