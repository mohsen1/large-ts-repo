import type { SimulationPlan, SimulationWave, SimulationConstraint, SignalDensityPoint, SimulationWorkspaceSnapshot, SimulationSummary } from './types';
import { type ReadinessSignal } from '@domain/recovery-readiness';

const severityToWeight = (signal: ReadinessSignal) => {
  switch (signal.severity) {
    case 'critical':
      return 6;
    case 'high':
      return 4;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
};

export const projectSignals = (signals: readonly ReadinessSignal[]): readonly SignalDensityPoint[] => {
  return Array.from({ length: 60 }, (_, minute) => {
    const bucket = signals.filter((signal) => new Date(signal.capturedAt).getUTCMinutes() === minute);
    const weightedSeverity = bucket.reduce((sum, signal) => sum + severityToWeight(signal), 0);
    return {
      minute,
      signals: bucket.length,
      weightedSeverity: bucket.length === 0 ? 0 : weightedSeverity / bucket.length,
    };
  });
};

export const summarizeOwnerMix = (waves: readonly SimulationWave[]): Readonly<Record<string, number>> => {
  const ownerCoverage: Record<string, number> = {};
  for (const wave of waves) {
    for (const signalId of wave.sequence) {
      const owner = signalId.split(':')[0] || 'other';
      ownerCoverage[owner] = (ownerCoverage[owner] ?? 0) + 1;
    }
  }
  return ownerCoverage;
};

export const computeRiskProfile = (summary: SimulationSummary, constraints: SimulationConstraint) => {
  if (summary.signalCoverage > constraints.maxRiskScore * 2) {
    return 'red';
  }
  if (summary.signalCoverage > constraints.maxRiskScore) {
    return 'amber';
  }
  return 'green';
};

export const finalizeMetrics = (plan: SimulationPlan, wavesExecuted: number) => ({
  runId: plan.runId,
  wavesExecuted,
  signalProcessingRate: Number((wavesExecuted / Math.max(1, plan.waves.length)).toFixed(4)),
  latencyP50Ms: wavesExecuted === 0 ? 0 : 120 + wavesExecuted * 8,
  ownerCoverage: summarizeOwnerMix(plan.waves),
  riskSignalCount: Math.floor(plan.summary.riskProfile === 'red' ? 10 : plan.summary.riskProfile === 'amber' ? 5 : 1),
  blockedSignalCount: plan.summary.waves.length - wavesExecuted,
  avgSignalsPerWave: plan.waves.length === 0
    ? 0
    : plan.summary.signalCoverage / plan.waves.length,
  waveCoverageProfile: plan.waves.map((wave) => wave.signalCount),
});

export const foldSnapshotProjection = (
  waves: readonly SimulationWave[],
  executedWaves: number,
): SimulationWorkspaceSnapshot => {
  const completedSignals = waves
    .slice(0, executedWaves)
    .reduce((sum, wave) => sum + wave.signalCount, 0);
  const totalSignals = waves.reduce((sum, wave) => sum + wave.signalCount, 0);
  const ratio = totalSignals === 0 ? 0 : completedSignals / totalSignals;

  return {
    runId: waves[0]?.id as SimulationPlan['runId'],
    executedWaves,
    status: executedWaves >= waves.length ? 'complete' : waves.length === 0 ? 'pending' : 'running',
    completedSignals,
    projectedSignalCoverage: ratio,
  };
};
