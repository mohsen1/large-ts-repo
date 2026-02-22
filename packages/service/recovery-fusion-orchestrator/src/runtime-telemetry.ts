import type { FusionMetrics, FusionCycleResult } from './types';
import type { FusionServiceDeps } from './types';
import type { FusionPlanRequest, FusionPlanResult } from '@domain/recovery-fusion-intelligence';
import type { RecoveryRunState } from '@domain/recovery-orchestration';

export interface TelemetrySample {
  readonly at: string;
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly labels: Record<string, string>;
}

interface ReadinessShape {
  readonly runId: RecoveryRunState['runId'];
  readonly averageReadiness: number;
  readonly minReadiness: number;
  readonly maxReadiness: number;
}

interface SequenceState {
  readonly samples: readonly TelemetrySample[];
  readonly runs: number;
}

const addSample = (
  metric: string,
  value: number,
  labels: Record<string, string>,
): TelemetrySample => ({
  at: new Date().toISOString(),
  metric,
  value,
  unit: '1',
  labels,
});

export const collectRuntimeSamples = (
  bundle: { runId: RecoveryRunState['runId'] },
  metrics: FusionMetrics,
): readonly TelemetrySample[] => [
  addSample('fusion.runtime.commands', metrics.commandCount, { runId: String(bundle.runId) }),
  addSample('fusion.runtime.evaluations', metrics.evaluationCount, { runId: String(bundle.runId) }),
  addSample('fusion.runtime.latency_p50', metrics.latencyP50, { runId: String(bundle.runId) }),
  addSample('fusion.runtime.latency_p90', metrics.latencyP90, { runId: String(bundle.runId) }),
];

const buildReadinessShape = (shape: ReadinessShape): ReadinessShape => ({
  runId: shape.runId,
  averageReadiness: Math.max(0, Math.min(1, shape.averageReadiness)),
  minReadiness: Math.max(0, Math.min(1, shape.minReadiness)),
  maxReadiness: Math.max(0, Math.min(1, shape.maxReadiness)),
});

const inferReadinessFromResult = (result: FusionPlanResult): ReadinessShape => {
  if (result.accepted) {
    return {
      runId: result.bundleId as unknown as RecoveryRunState['runId'],
      averageReadiness: 0.8,
      minReadiness: 0.55,
      maxReadiness: 0.95,
    };
  }

  return {
    runId: result.bundleId as unknown as RecoveryRunState['runId'],
    averageReadiness: 0.35,
    minReadiness: 0.2,
    maxReadiness: 0.55,
  };
};

export const projectReadinessSamples = (shape: ReadinessShape): readonly TelemetrySample[] => [
  addSample('fusion.readiness.avg', shape.averageReadiness, { runId: String(shape.runId), stable: String(shape.minReadiness > 0.45) }),
  addSample('fusion.readiness.min', shape.minReadiness, { runId: String(shape.runId) }),
  addSample('fusion.readiness.max', shape.maxReadiness, { runId: String(shape.runId) }),
];

export const buildTelemetrySequence = (
  bundle: { runId: RecoveryRunState['runId'] },
  metrics: FusionMetrics,
  cycle: FusionCycleResult,
): readonly TelemetrySample[] => {
  const runtimeSamples = collectRuntimeSamples(bundle, metrics);
  const firstSnapshot = cycle.snapshots[0];
  if (!firstSnapshot) {
    return runtimeSamples;
  }

  const inferred = inferReadinessFromResult(firstSnapshot.planResult);
  const readinessShape = buildReadinessShape({
    runId: bundle.runId,
    averageReadiness: inferred.averageReadiness,
    minReadiness: inferred.minReadiness,
    maxReadiness: inferred.maxReadiness,
  });

  return [...runtimeSamples, ...projectReadinessSamples(readinessShape)];
};

export const startTelemetrySequence = async (
  _deps: FusionServiceDeps,
  request: FusionPlanRequest,
): Promise<Readonly<SequenceState>> => {
  const baseReadiness = Math.max(0.05, Math.min(0.95, request.signals.length / Math.max(1, request.budget.maxParallelism * 10)));
  const sampleSeed = [
    addSample('fusion.sequence.started', 1, { planId: request.planId, runId: String(request.runId) }),
    addSample('fusion.sequence.signals', request.signals.length, { planId: request.planId, runId: String(request.runId) }),
    addSample('fusion.sequence.readiness_seed', Math.round(baseReadiness * 100), { planId: request.planId, runId: String(request.runId) }),
  ];

  return {
    samples: sampleSeed,
    runs: sampleSeed.length,
  };
};
