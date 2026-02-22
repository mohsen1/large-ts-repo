import type { SituationalSignal, RecoveryHypothesis, WeightedMetric } from './situation-types';

const SIGNAL_WEIGHTS = {
  detect: 0.2,
  assess: 0.18,
  mitigate: 0.27,
  recover: 0.22,
  stabilize: 0.13,
} as const;

export const severityWeight = (severity: number): number => {
  if (severity <= 1) {
    return 0.6;
  }
  if (severity <= 3) {
    return 0.9;
  }
  if (severity <= 5) {
    return 1.2;
  }
  return 1;
};

export const evidenceConfidence = (signal: SituationalSignal): number => {
  const evidenceFactor = 1 + Math.min(5, Math.sqrt(signal.evidenceCount)) / 10;
  return Number((signal.confidence * severityWeight(signal.severity) * evidenceFactor).toFixed(4));
};

export const rankSignals = (signals: readonly SituationalSignal[]): readonly string[] => {
  return [...signals]
    .sort((left, right) => {
      const scoreLeft = evidenceConfidence(left);
      const scoreRight = evidenceConfidence(right);
      return scoreRight - scoreLeft;
    })
    .map((signal) => signal.signalId);
};

export const scoreByTag = (signals: readonly SituationalSignal[], tag: string): number => {
  const filtered = signals.filter((signal) => signal.tags.includes(tag));
  if (filtered.length === 0) {
    return 0;
  }

  const aggregate = filtered.reduce((acc, signal) => acc + evidenceConfidence(signal), 0);
  return Number((aggregate / filtered.length).toFixed(4));
};

export const weightedSignalModel = <T extends SituationalSignal>(
  signal: T,
  phase: keyof typeof SIGNAL_WEIGHTS,
): WeightedMetric<T> => ({
  metric: signal,
  weight: SIGNAL_WEIGHTS[phase] * evidenceConfidence(signal),
});

export const buildHypothesisScore = (hypothesis: RecoveryHypothesis, signals: readonly SituationalSignal[]): number => {
  const matchedSignals = signals.filter((signal) => hypothesis.commands.some((command) => signal.tags.includes(command)));
  const avgConfidence = matchedSignals.length
    ? matchedSignals.reduce((acc, signal) => acc + evidenceConfidence(signal), 0) / matchedSignals.length
    : 0;
  const sideEffectPenalty = Math.min(0.6, hypothesis.sideEffects.length * 0.08);
  const raw = hypothesis.evidenceWeight * 0.4 + avgConfidence * 0.6 - sideEffectPenalty - hypothesis.likelyImpactPercent / 200;
  return Math.max(0, Number(raw.toFixed(5)));
};
