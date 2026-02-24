import { CommandRunbook, OrchestrationPlan, RecoverySignal, TenantId, WorkloadTopology, SimulationTick } from './models';
import { evaluateTopology, inferRiskBandFromSignals } from './topology-intelligence';

export interface RunbookExposure {
  readonly runbookId: CommandRunbook['id'];
  readonly activeSteps: number;
  readonly dependencySignals: number;
  readonly estimatedMinutes: number;
  readonly riskScore: number;
  readonly stepVariance: number;
}

export interface StressEnvelope {
  readonly tenantId: TenantId;
  readonly generatedAt: string;
  readonly runbookCount: number;
  readonly runbookExposures: readonly RunbookExposure[];
  readonly topologyExposure: {
    readonly cells: readonly {
      readonly workloadId: WorkloadTopology['nodes'][number]['id'];
      readonly degree: number;
      readonly isolationRisk: number;
    }[];
    readonly maxCriticality: number;
  };
  readonly signalDensity: {
    readonly totalSignals: number;
    readonly criticalityScore: number;
    readonly severity: Readonly<Record<RecoverySignal['severity'], number>>;
  };
  readonly scenarioComplexity: number;
  readonly driftBudgetMinutes: number;
  readonly readinessBudget: number;
}

export interface DriftSample {
  readonly tick: number;
  readonly risk: number;
  readonly sla: number;
  readonly blockedSignals: number;
}

export interface StressEnvelopeInput {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly topology: WorkloadTopology;
  readonly tickBudget: number;
}

const safePhaseWeight = (phase: string): number => {
  switch (phase) {
    case 'observe':
      return 1;
    case 'isolate':
      return 2;
    case 'migrate':
      return 2.4;
    case 'verify':
      return 1.2;
    case 'restore':
      return 1.6;
    case 'standdown':
      return 0.6;
    default:
      return 1;
  }
};

const normalizeSignal = (signal: RecoverySignal): number => {
  if (signal.severity === 'critical') return 4;
  if (signal.severity === 'high') return 3;
  if (signal.severity === 'medium') return 2;
  return 1;
};

const buildRunbookSignalPressure = (input: readonly RecoverySignal[]): number =>
  input.reduce((acc, signal) => acc + normalizeSignal(signal), 0);

const buildRunbookExposure = (runbook: CommandRunbook, signalCount: number): RunbookExposure => {
  const activeSteps = runbook.steps.filter((step) => step.estimatedMinutes > 0).length;
  const averageMinutes = runbook.steps.length === 0 ? 0 : runbook.steps.reduce((sum, step) => sum + step.estimatedMinutes, 0) / runbook.steps.length;
  const dependencySignals = Math.max(1, runbook.steps.reduce((sum, step) => sum + step.requiredSignals.length, 0));
  const stepVariance = runbook.steps.length <= 1 ? 0 :
    (() => {
      const weights = runbook.steps.map((step) => safePhaseWeight(step.phase));
      const mean = weights.reduce((sum, value) => sum + value, 0) / weights.length;
      const variance = weights.reduce((sum, value) => sum + (value - mean) ** 2, 0) / weights.length;
      return Number(Math.sqrt(variance).toFixed(4));
    })();
  const riskScore = Number(((dependencySignals * safePhaseWeight('migrate')) / Math.max(1, activeSteps) + (signalCount * 0.75) + (averageMinutes / 20)).toFixed(3));

  return {
    runbookId: runbook.id,
    activeSteps,
    dependencySignals,
    estimatedMinutes: Number(averageMinutes.toFixed(2)),
    riskScore,
    stepVariance,
  };
};

const inferTopologies = (topology: WorkloadTopology): number => {
  if (topology.nodes.length === 0) {
    return 0;
  }

  const coupling = topology.edges.reduce((acc, edge) => acc + edge.coupling, 0);
  const risk = topology.edges.length === 0 ? 0.5 : Math.min(1, coupling / topology.edges.length);
  return Number(((topology.nodes.length + topology.edges.length) * (1 + risk)).toFixed(2));
};

export const buildStressEnvelope = (input: StressEnvelopeInput): StressEnvelope => {
  const topologyHealth = evaluateTopology(input.topology);
  const exposures = input.topology.edges.map((edge) => ({
    workloadId: edge.from,
    degree: Math.max(1, edge.to.length + edge.from.length),
    isolationRisk: edge.coupling,
  }));

  const signalDensity = {
    totalSignals: input.signals.length,
    criticalityScore: Math.max(...input.signals.map((signal) => {
      if (signal.severity === 'critical') return 4;
      if (signal.severity === 'high') return 3;
      if (signal.severity === 'medium') return 2;
      return 1;
    }), 0),
    severity: {
      low: input.signals.filter((signal) => signal.severity === 'low').length,
      medium: input.signals.filter((signal) => signal.severity === 'medium').length,
      high: input.signals.filter((signal) => signal.severity === 'high').length,
      critical: input.signals.filter((signal) => signal.severity === 'critical').length,
    },
  };
  const topologyExposure = {
    cells: [...exposures],
    maxCriticality: Math.max(...exposures.map((entry) => entry.degree), 0),
  };
  const runbookExposures = input.runbooks.map((runbook) => buildRunbookExposure(runbook, input.signals.length));
  const runbookSignalScore = buildRunbookSignalPressure(input.signals);
  const topologyPressure = inferTopologies(input.topology);
  const bandMultiplier = inferRiskBandFromSignals(input.signals) === 'critical' ? 3 : input.signals.length === 0 ? 1 : 1.6;

  const scenarioComplexity = Number((topologyPressure + runbookSignalScore + runbookExposures.length + input.plan.estimatedCompletionMinutes) * bandMultiplier);
  const driftBudgetMinutes = Math.max(1, input.tickBudget + runbookExposures.length);
  const readinessBudget = Math.max(0, 100 - Math.min(100, scenarioComplexity / 3 + input.runbooks.length));

  const summary = {
    tenantId: input.tenantId,
    generatedAt: new Date().toISOString(),
    runbookCount: input.runbooks.length,
    runbookExposures,
    topologyExposure: {
      ...topologyExposure,
      cells: topologyExposure.cells.map((entry) => ({
        ...entry,
        isolationRisk: Number((entry.isolationRisk * input.runbooks.length).toFixed(3)),
      })),
    },
    signalDensity,
    scenarioComplexity,
    driftBudgetMinutes,
    readinessBudget,
  };

  return {
    ...summary,
    topologyExposure: {
      cells: summary.topologyExposure.cells,
      maxCriticality: Math.max(summary.topologyExposure.maxCriticality, topologyHealth.maxInDegree),
    },
  };
};

const buildDriftBuckets = (input: StressEnvelope, tickCount: number): readonly DriftSample[] => {
  if (tickCount <= 0) {
    return [{ tick: 0, risk: 0, sla: 1, blockedSignals: 0 }];
  }

  const buckets: DriftSample[] = [];
  for (let tick = 0; tick < tickCount; tick += 1) {
    const baseRisk = Math.min(1, (input.scenarioComplexity * (tick + 1)) / Math.max(1, tickCount * 4));
    const blockedSignals = Math.round(baseRisk * input.runbookExposures.length);
    const sla = Number(Math.max(0, 1 - baseRisk * 0.2 - blockedSignals * 0.01).toFixed(4));
    buckets.push({
      tick,
      risk: Number(baseRisk.toFixed(4)),
      sla,
      blockedSignals,
    });
  }

  return buckets;
};

export const buildExecutionDrift = (input: StressEnvelope, tickCount = 20): readonly DriftSample[] => {
  const samples = buildDriftBuckets(input, tickCount);
  const averageRisk = samples.reduce((acc, entry) => acc + entry.risk, 0) / Math.max(1, samples.length);
  const last = samples[samples.length - 1];

  if (averageRisk > 0.9) {
    return [
      ...samples,
      {
        tick: samples.length,
        risk: 1,
        sla: 0.05,
        blockedSignals: input.topologyExposure.cells.length,
      },
    ];
  }

  if (last && last.blockedSignals > input.runbookExposures.length / 2) {
    return [...samples, { tick: samples.length, risk: 1, sla: Math.max(0, (last.sla ?? 1) - 0.15), blockedSignals: last.blockedSignals }];
  }

  return samples;
};
