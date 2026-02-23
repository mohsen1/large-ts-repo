import {
  ReadinessWindow,
  CommandRunbook,
  RecoverySimulationResult,
  RecoverySignal,
  SeverityBand,
  OrchestrationPlan,
  TenantId,
  SimulationTick,
  WorkloadId,
  createWorkloadId,
} from './models';
import { TimelineEntry, scheduleCoverageScore, buildReadinessWindows, timelineDigest } from './schedule';
import { inferRiskBandFromSignals } from './topology-intelligence';

export interface BandedCoverage {
  readonly band: SeverityBand;
  readonly expectedMinutes: number;
  readonly budgetedMinutes: number;
  readonly utilization: number;
}

export interface PlanMetric {
  readonly planName: string;
  readonly runbookCount: number;
  readonly estimatedMinutes: number;
  readonly windowCoverage: number;
  readonly coverageByWindow: ReadonlyArray<Readonly<{ runbookId: string; loads: number }>>;
}

export interface SignalDigest {
  readonly tenantId: TenantId;
  readonly totalSignals: number;
  readonly criticalSignals: number;
  readonly classHistogram: Readonly<Record<RecoverySignal['class'], number>>;
  readonly band: SeverityBand;
  readonly topSeverity: RecoverySignal['severity'];
}

export interface SimulationEnvelope {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly tickCount: number;
  readonly maxActive: number;
  readonly avgConfidence: number;
  readonly blockedRate: number;
  readonly phaseMix: Readonly<Record<string, number>>;
}

export interface ExecutionForecast {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly riskScore: number;
  readonly sla: number;
  readonly projectedCompletionMinutes: number;
  readonly confidenceBand: Readonly<{ low: number; mid: number; high: number }>;
}

const BAND_BUDGET: Record<SeverityBand, number> = {
  low: 60,
  medium: 120,
  high: 210,
  critical: 320,
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const normalizeClass = (value: RecoverySignal['class']): RecoverySignal['class'] => {
  return value;
};

export const summarizeSignals = (tenantId: TenantId, signals: readonly RecoverySignal[]): SignalDigest => {
  let criticalSignals = 0;
  const classHistogram: Record<RecoverySignal['class'], number> = {
    availability: 0,
    integrity: 0,
    performance: 0,
    compliance: 0,
  };

  for (const signal of signals) {
    classHistogram[normalizeClass(signal.class)] += 1;
    if (signal.severity === 'critical') {
      criticalSignals += 1;
    }
  }

  const sorted = [...signals].sort((left, right) => {
    const weight = (signal: RecoverySignal) => {
      if (signal.severity === 'critical') return 4;
      if (signal.severity === 'high') return 3;
      if (signal.severity === 'medium') return 2;
      return 1;
    };
    return weight(right) - weight(left);
  });

  const topSeverity = sorted[0]?.severity ?? 'low';

  return {
    tenantId,
    totalSignals: signals.length,
    criticalSignals,
    classHistogram,
    band: inferRiskBandFromSignals(signals),
    topSeverity,
  };
};

export const computePlanMetric = (plan: OrchestrationPlan): PlanMetric => {
  const timeline = plan.schedule.map((entry): TimelineEntry => {
    const windowStart = new Date(entry.startAt);
    const windowEnd = new Date(entry.endAt);
    const dayIndex = windowStart.getUTCDay();
    const workloadIds = [...plan.runbooks.flatMap((runbook) => [createWorkloadId(String(runbook.id))])];
    return {
      runbookId: entry.runbookId,
      window: {
        startMinute: windowStart.getHours() * 60 + windowStart.getMinutes(),
        endMinute: windowEnd.getHours() * 60 + windowEnd.getMinutes(),
        dayIndex,
      },
      workloadIds,
    };
  });

  const estimatedMinutes = Math.max(1, plan.estimatedCompletionMinutes);
  const budgetedMinutes = BAND_BUDGET[plan.schedule.length === 0 ? 'low' : 'medium'];
  const windowCoverage = scheduleCoverageScore(timeline, budgetedMinutes);
  const coverageByWindow = timelineDigest(timeline);

  return {
    planName: plan.scenarioName,
    runbookCount: plan.runbooks.length,
    estimatedMinutes,
    windowCoverage,
    coverageByWindow,
  };
};

export const simulateBandCoverage = (runbooks: readonly CommandRunbook[], band: SeverityBand): BandedCoverage => {
  const expectedMinutes = BAND_BUDGET[band];
  const windows = runbooks.flatMap((runbook) => buildReadinessWindows(runbook, band));
  const timeline = windows.map((window) => ({
    runbookId: window.runbookId,
    window: {
      startMinute: new Date(window.startAt).getHours() * 60 + new Date(window.startAt).getMinutes(),
      endMinute: new Date(window.endAt).getHours() * 60 + new Date(window.endAt).getMinutes(),
      dayIndex: new Date(window.startAt).getUTCDay(),
    },
    workloadIds: [window.runbookId],
  }));
  const budgetedMinutes = expectedMinutes + expectedMinutes * 0.2;
  const actual = timeline.reduce((acc, entry) => {
    const span = entry.window.endMinute - entry.window.startMinute;
    return acc + Math.max(span, 0);
  }, 0);

  return {
    band,
    expectedMinutes: expectedMinutes,
    budgetedMinutes,
    utilization: clamp01(budgetedMinutes === 0 ? 0 : actual / budgetedMinutes),
  };
};

export const summarizeSimulation = (tenantId: TenantId, band: SeverityBand, simulation: RecoverySimulationResult): SimulationEnvelope => {
  let maxActive = 0;
  let blockedTotal = 0;
  const phaseMix: Record<string, number> = {};
  for (const tick of simulation.ticks) {
    maxActive = Math.max(maxActive, tick.activeWorkloads);
    blockedTotal += tick.blockedWorkloads.length;
    phaseMix[`${tick.activeWorkloads}`] = (phaseMix[`${tick.activeWorkloads}`] ?? 0) + 1;
  }
  const tickCount = simulation.ticks.length;
  const blockedRate = tickCount === 0 ? 0 : blockedTotal / tickCount;
  const avgConfidence =
    tickCount === 0
      ? 0
      : simulation.ticks.reduce((acc, tick) => acc + tick.confidence, 0) / tickCount;

  return {
    tenantId,
    band,
    tickCount,
    maxActive,
    avgConfidence: clamp01(avgConfidence),
    blockedRate: clamp01(blockedRate),
    phaseMix,
  };
};

export const forecastExecution = (plan: OrchestrationPlan, simulation: RecoverySimulationResult): ExecutionForecast => {
  const signalCount = new Set(plan.runbooks.flatMap((runbook) => runbook.steps.flatMap((step) => step.requiredSignals))).size;
  const riskScore = simulation.riskScore + signalCount * 0.003;
  const sla = simulation.slaCompliance * (signalCount > 0 ? 0.99 : 1);
  const projectedCompletionMinutes = Math.max(plan.estimatedCompletionMinutes, simulation.ticks.length);
  const width = projectedCompletionMinutes / Math.max(1, plan.estimatedCompletionMinutes);
  return {
    tenantId: plan.tenantId,
    band: plan.schedule.length > 3 ? 'high' : 'medium',
    riskScore: clamp01(riskScore),
    sla: clamp01(sla),
    projectedCompletionMinutes,
    confidenceBand: {
      low: clamp01(simulation.riskScore * 0.5 * width),
      mid: clamp01(simulation.riskScore * width),
      high: clamp01(simulation.riskScore * Math.min(width + 0.5, 1)),
    },
  };
};

export const compareSimulationsForDrift = (base: RecoverySimulationResult, candidate: RecoverySimulationResult): {
  readonly changed: boolean;
  readonly metrics: Readonly<{ riskDelta: number; slaDelta: number; durationDelta: number }>;
  readonly reason: string;
} => {
  const riskDelta = candidate.riskScore - base.riskScore;
  const slaDelta = candidate.slaCompliance - base.slaCompliance;
  const durationDelta = candidate.ticks.length - base.ticks.length;
  const changed = Math.abs(riskDelta) > 0.02 || Math.abs(slaDelta) > 0.02 || Math.abs(durationDelta) > 20;
  let reason = 'No meaningful delta';
  if (riskDelta < -0.05) reason = 'Risk improved significantly';
  else if (riskDelta > 0.05) reason = 'Risk regression risk detected';
  else if (slaDelta > 0.05) reason = 'SLA improved';
  else if (slaDelta < -0.05) reason = 'SLA regression likely';
  else if (durationDelta > 20) reason = 'Execution window elongated';
  else if (durationDelta < -20) reason = 'Execution shortened';

  return {
    changed,
    metrics: {
      riskDelta,
      slaDelta,
      durationDelta,
    },
    reason,
  };
};
