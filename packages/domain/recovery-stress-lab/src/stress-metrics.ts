import { clampConfidence } from './models';
import { WorkloadTopology, RecoverySignal, RecoverySimulationResult, OrchestrationPlan, CommandRunbook, SeverityBand } from './models';
import { summarizeSignals, computePlanMetric, summarizeSimulation } from './stress-analytics';
import { mapNodeExposure, inferRiskBandFromSignals } from './topology-intelligence';

export interface WindowedSignalMetric {
  readonly windowIndex: number;
  readonly severityWeight: number;
  readonly uniqueSignalCount: number;
}

export interface WorkloadHealthMetric {
  readonly workloadId: string;
  readonly exposureRisk: number;
  readonly signalPressure: number;
}

export interface StressMetricReport {
  readonly tenantId: string;
  readonly band: SeverityBand;
  readonly signalHealth: {
    readonly totalSignals: number;
    readonly criticalSignals: number;
    readonly classCoverage: ReadonlyArray<{ key: string; value: number }>;
  };
  readonly simulationHealth: {
    readonly avgConfidence: number;
    readonly blockedRate: number;
    readonly maxActive: number;
    readonly durationMinutes: number;
  };
  readonly topologyHealth: {
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly highRiskNodes: number;
  };
  readonly planHealth: {
    readonly runbookCount: number;
    readonly estimatedMinutes: number;
    readonly readinessScore: number;
    readonly topologyCoverage: number;
  };
  readonly workloadHealth: ReadonlyArray<WorkloadHealthMetric>;
  readonly windows: ReadonlyArray<WindowedSignalMetric>;
}

const classOrder = ['availability', 'integrity', 'performance', 'compliance'] as const;

const classCoverage = (digest: ReturnType<typeof summarizeSignals>) => {
  return classOrder.map((entry) => ({
    key: entry,
    value: Object.values(digest.classHistogram)[classOrder.indexOf(entry)],
  }));
};

const collectTopologyPressure = (topology: WorkloadTopology, signals: readonly RecoverySignal[]): ReadonlyArray<WorkloadHealthMetric> => {
  const exposures = mapNodeExposure(topology);
  return exposures
    .map((entry, index) => {
      const signalPressure = (signals[index % Math.max(1, signals.length)]?.severity === 'critical'
        ? 4
        : signals[index % Math.max(1, signals.length)]?.severity === 'high'
          ? 3
          : signals[index % Math.max(1, signals.length)]?.severity === 'medium'
            ? 2
            : 1) / 4;
      return {
        workloadId: entry.nodeId,
        exposureRisk: clampConfidence(entry.isolationRisk),
        signalPressure,
      };
    })
    .sort((left, right) => right.exposureRisk - left.exposureRisk);
};

const windowedSignalHealth = (signals: readonly RecoverySignal[]): ReadonlyArray<WindowedSignalMetric> => {
  const output = new Map<number, number>();
  for (const signal of signals) {
    const createdAt = new Date(signal.createdAt);
    const minute = createdAt.getUTCHours() * 6 + Math.floor(createdAt.getUTCMinutes() / 10);
    const current = output.get(minute) ?? 0;
    const severity = signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1;
    output.set(minute, current + severity);
  }

  return [...output.entries()]
    .sort(([left], [right]) => left - right)
    .map(([windowIndex, severityWeight]) => ({
      windowIndex,
      severityWeight,
      uniqueSignalCount: Math.max(1, Math.floor(severityWeight / 2)),
    }));
};

const topologyCoverageFromPlan = (plan: OrchestrationPlan): number => {
  const allSteps = plan.runbooks.reduce((sum, runbook) => sum + runbook.steps.length, 0);
  const activeConnections = plan.dependencies.edges.length;
  return clampConfidence((allSteps + activeConnections) / Math.max(1, plan.schedule.length || 1));
};

const readinessScore = (planMetric: ReturnType<typeof computePlanMetric>): number => {
  return clampConfidence(planMetric.windowCoverage * 0.7 + Math.min(1, planMetric.estimatedMinutes / 120) * 0.3);
};

export const buildStressMetricReport = (
  tenantId: string,
  signals: readonly RecoverySignal[],
  topology: WorkloadTopology,
  simulation: RecoverySimulationResult | null,
  plan: OrchestrationPlan | null,
  runbooks: readonly CommandRunbook[],
): StressMetricReport => {
  const digest = summarizeSignals(tenantId as any, signals);
  const inferredBand = inferRiskBandFromSignals(signals);
  const coverage = simulation ? summarizeSimulation(tenantId as any, inferredBand, simulation) : null;
  const planMetric = plan ? computePlanMetric(plan) : null;
  const topologyProfile = collectTopologyPressure(topology, signals);
  const windows = windowedSignalHealth(signals);
  const planSummary = plan
    ? {
      runbookCount: plan.runbooks.length,
      estimatedMinutes: plan.estimatedCompletionMinutes,
      readinessScore: planMetric ? readinessScore(planMetric) : 0,
      topologyCoverage: topologyCoverageFromPlan(plan),
    }
    : {
        runbookCount: runbooks.length,
        estimatedMinutes: 0,
        readinessScore: 0,
        topologyCoverage: 0,
      };

  const classReport = classCoverage(digest);
  return {
    tenantId,
    band: inferredBand,
    signalHealth: {
      totalSignals: digest.totalSignals,
      criticalSignals: digest.criticalSignals,
      classCoverage: classReport,
    },
    simulationHealth: {
      avgConfidence: coverage?.avgConfidence ?? 0,
      blockedRate: coverage?.blockedRate ?? 0,
      maxActive: coverage?.maxActive ?? 0,
      durationMinutes: coverage?.tickCount ?? 0,
    },
    topologyHealth: {
      nodeCount: topology.nodes.length,
      edgeCount: topology.edges.length,
      highRiskNodes: topologyProfile.filter((entry) => entry.exposureRisk > 0.8).length,
    },
    planHealth: planSummary,
    workloadHealth: topologyProfile,
    windows,
  };
};

export interface StressMetricComparison {
  readonly tenantId: string;
  readonly summary: {
    readonly driftScore: number;
    readonly improved: boolean;
    readonly topRiskWorkloads: readonly string[];
  };
  readonly trend: ReadonlyArray<{ key: string; value: number }>;
}

export const compareStressReports = (left: StressMetricReport, right: StressMetricReport): StressMetricComparison => {
  const driftScore = (right.simulationHealth.avgConfidence - left.simulationHealth.avgConfidence)
    + (right.signalHealth.criticalSignals - left.signalHealth.criticalSignals) * 0.2
    + (right.topologyHealth.highRiskNodes - left.topologyHealth.highRiskNodes) * 0.1;

  const leftTop = left.workloadHealth.slice(0, 3).map((entry) => entry.workloadId);
  const rightTop = right.workloadHealth.slice(0, 3).map((entry) => entry.workloadId);
  return {
    tenantId: right.tenantId,
    summary: {
      driftScore: clampConfidence(Math.abs(driftScore)),
      improved: driftScore > 0,
      topRiskWorkloads: rightTop,
    },
    trend: [...new Set([...leftTop, ...rightTop])].map((key) => ({ key, value: Math.random() })),
  };
};
