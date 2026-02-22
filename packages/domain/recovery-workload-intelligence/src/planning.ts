import type {
  ForecastInput,
  ScenarioForecast,
  WorkloadDependencyGraph,
  WorkloadNode,
  WorkloadSnapshot,
} from './types';
import { evaluateRiskScore, forecastFromScore } from './risk';
import { buildLevels, hasCycles } from './dependency';

export interface PlanningWindow {
  readonly node: WorkloadNode;
  readonly snapshots: readonly WorkloadSnapshot[];
  readonly baseline: number;
  readonly predictedPeak: number;
  readonly recommendations: readonly string[];
}

export interface PlanningPlan {
  readonly windowKey: string;
  readonly node: WorkloadNode;
  readonly forecasts: readonly ScenarioForecast[];
  readonly executionOrder: readonly WorkloadNode['id'][];
  readonly riskProfiles: readonly ReturnType<typeof evaluateRiskScore>[];
}

export const buildPlanningWindow = (
  input: ForecastInput,
  snapshots: readonly WorkloadSnapshot[],
): PlanningWindow => {
  const values = snapshots.map((snapshot) => snapshot.cpuUtilization);
  const baseline = values.length === 0 ? 0 : values.reduce((acc, value) => acc + value, 0) / values.length;
  const predictedPeak = values.length === 0 ? input.snapshot.cpuUtilization : Math.max(...values);
  const recommendations = [
    baseline > 80 ? 'Add surge capacity at region edge' : 'No surge capacity needed',
    predictedPeak > 90 ? 'Force strict scheduling for maintenance windows' : 'Use adaptive run balancing',
    input.lookbackDays >= 14 ? 'Historical trend indicates sustained growth in demand' : 'Sparse history, confidence moderate',
  ];

  return {
    node: input.node,
    snapshots: snapshots.slice(-14),
    baseline,
    predictedPeak,
    recommendations,
  };
};

export const buildPlanningPlan = (
  node: WorkloadNode,
  snapshots: readonly WorkloadSnapshot[],
  graph: WorkloadDependencyGraph,
): PlanningPlan => {
  if (graph.nodes.length === 0) {
    throw new Error('dependency graph is empty');
  }

  const planSnapshots = snapshots.slice(-21);
  const levels = buildLevels(graph);
  const order = levels
    .slice()
    .sort((left, right) => left.level - right.level)
    .map((entry) => entry.nodeId)
    .filter((id) => id);

  const executionOrder = order.length > 0 ? order : graph.nodes.map((nodeEntry) => nodeEntry.id);
  const cycleDetected = hasCycles(graph);

  if (cycleDetected) {
    throw new Error('dependency graph has cycle');
  }

  const normalizeSeverity = (snapshot: WorkloadSnapshot): 1 | 2 | 3 | 4 | 5 => {
    const value = Math.round((snapshot.cpuUtilization + snapshot.errorRate) / 20);
    if (value <= 1) {
      return 1;
    }
    if (value === 2) {
      return 2;
    }
    if (value === 3) {
      return 3;
    }
    if (value === 4) {
      return 4;
    }
    return 5;
  };

  const blastRadius = node.criticality >= 4 ? 'global' : node.criticality >= 3 ? 'region' : 'zone';

  const riskProfiles = planSnapshots
    .map((snapshot) => evaluateRiskScore(snapshot, {
      severity: normalizeSeverity(snapshot),
      blastRadius,
      customerImpact: node.targetSlaMinutes,
      recoveryToleranceSeconds: node.targetSlaMinutes * 60,
    }))
    .filter((_, index) => index < 3);

  const forecasts: ScenarioForecast[] = [];
  for (const snapshot of planSnapshots.slice(-3)) {
    forecasts.push(
      forecastFromScore(
        snapshot.nodeId,
        `${snapshot.timestamp}-prediction`,
        evaluateRiskScore(snapshot, {
          severity: normalizeSeverity(snapshot),
          blastRadius,
          customerImpact: node.targetSlaMinutes,
          recoveryToleranceSeconds: node.targetSlaMinutes * 60,
        }).riskScore,
      ),
    );
  }

  return {
    windowKey: `${node.id}:${buildLevels(graph)[0]?.nodeId ?? node.id}`,
    node,
    forecasts,
    executionOrder,
    riskProfiles,
  };
};

export const prioritizePlans = (plans: readonly PlanningPlan[]): readonly PlanningPlan[] =>
  [...plans].sort((left, right) => {
    const l = left.riskProfiles[0]?.riskScore ?? 0;
    const r = right.riskProfiles[0]?.riskScore ?? 0;
    return r - l;
  });
