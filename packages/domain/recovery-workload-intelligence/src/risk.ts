import type {
  IncidentRiskVector,
  ScenarioForecast,
  WorkloadSnapshot,
  WorkloadRiskProfile,
  WorkloadUnitId,
} from './types';

const normalize = (value: number, min: number, max: number): number => {
  if (max === min) {
    return 0;
  }
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
};

const toDecimal = (value: number, precision = 4): number => Number(value.toFixed(precision));

export const evaluateRiskScore = (
  snapshot: WorkloadSnapshot,
  vector: IncidentRiskVector,
): WorkloadRiskProfile => {
  const utilizationSignal = normalize(snapshot.cpuUtilization, 0, 100) * 0.45;
  const iopsSignal = normalize(snapshot.iopsUtilization, 0, 100) * 0.2;
  const errorSignal = normalize(snapshot.errorRate, 0, 50) * 0.2;
  const throughputSignal = normalize(snapshot.throughput, 0, 10000);
  const impactSignal = normalize(vector.customerImpact, 0, 100) * 0.15;

  const score = toDecimal(
    utilizationSignal + iopsSignal + errorSignal + (1 - throughputSignal) * 0.0 + impactSignal + (vector.recoveryToleranceSeconds > 300 ? 0.1 : 0.0),
    4,
  );

  const contributingFactors = [
    { factor: 'cpu', weight: Number(utilizationSignal.toFixed(3)) },
    { factor: 'iops', weight: Number(iopsSignal.toFixed(3)) },
    { factor: 'error-rate', weight: Number(errorSignal.toFixed(3)) },
    { factor: 'customer-impact', weight: Number(impactSignal.toFixed(3)) },
  ];

  const riskClass = score >= 0.85 ? 'critical' : score >= 0.65 ? 'high' : score >= 0.35 ? 'medium' : 'low';

  return {
    workloadId: snapshot.nodeId,
    riskScore: score,
    riskClass,
    contributingFactors,
  };
};

export const forecastFromScore = (
  workloadId: WorkloadUnitId,
  scenarioName: string,
  riskScore: number,
): ScenarioForecast => {
  const confidence = toDecimal(Math.max(0.25, Math.min(0.99, 1 - riskScore * 0.35)), 3);
  const projectedDowntimeMinutes = Math.round(riskScore * 120);
  const mitigationSuggestions = [
    projectedDowntimeMinutes > 90 ? 'Raise cache prewarm window by 20 minutes' : 'Increase baseline error budget by 5% for this wave',
    projectedDowntimeMinutes > 45 ? 'Stage fallback topology in standby zone' : 'Enable canary for dependent workers',
    projectedDowntimeMinutes > 20 ? 'Increase alert cadence to 30s sampling' : 'Reduce runbook lead time by 10 minutes',
  ];

  return {
    scenarioId: `forecast-${scenarioName}-${workloadId}` as ScenarioForecast['scenarioId'],
    nodeId: workloadId,
    name: scenarioName,
    confidence,
    projectedDowntimeMinutes,
    mitigationSuggestions,
  };
};
