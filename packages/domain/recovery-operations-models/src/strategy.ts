import type { RecoveryConstraintBudget, IncidentFingerprint, RecoverySignal } from './types';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

const classScores: Record<string, number> = {
  infrastructure: 1.8,
  database: 2.2,
  network: 1.4,
  application: 1.1,
  'third-party': 1.6,
};

const normalize = (value: number) => Math.min(1, Math.max(0, value));

export const estimateBudgetFromSignals = (
  fingerprint: IncidentFingerprint,
  signals: readonly RecoverySignal[],
): RecoveryConstraintBudget => {
  const avgSeverity = signals.length
    ? signals.reduce((acc, signal) => acc + normalize(signal.severity / 10), 0) / signals.length
    : 0.3;
  const confidenceBoost = signals.reduce((acc, signal) => acc + normalize(signal.confidence), 0);
  const classScore = classScores[fingerprint.impactClass] ?? 1;
  const multiplier = Math.max(0.5, Math.min(2.5, avgSeverity + confidenceBoost * 0.2 + classScore * 0.1));

  const timeoutMinutes = Math.max(10, Math.round(fingerprint.estimatedRecoveryMinutes * multiplier));
  return {
    maxParallelism: Math.max(1, Math.min(12, Math.round(2 * multiplier))),
    maxRetries: Math.max(1, Math.round(3 * multiplier)),
    timeoutMinutes,
    operatorApprovalRequired: avgSeverity > 0.6 || classScore > 2,
  };
};

export const computeSessionScore = (program: RecoveryProgram, signals: readonly RecoverySignal[]): number => {
  const timeoutPressure = Math.max(0, (60 - program.steps.length) / 60);
  const signalScore = signals.reduce((acc, signal) => acc + normalize(signal.severity / 10), 0);
  const parallelBoost = Math.min(0.4, program.topology.fallbackServices.length / 20);
  return Number((signalScore * 0.7 + timeoutPressure * 0.2 + parallelBoost).toFixed(4));
};

export const isHighRisk = (program: RecoveryProgram, signals: readonly RecoverySignal[]): boolean => {
  const score = computeSessionScore(program, signals);
  return score > 4.5 || program.topology.rootServices.length > 12;
};
