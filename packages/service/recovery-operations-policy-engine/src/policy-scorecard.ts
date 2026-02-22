import type { PolicyExecutionContext, PolicyScoreCard } from './policy-types';

const toPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
};

const policyDensity = (value: number): number => Math.min(100, Math.max(0, (20 - value) * 5));

const computeSignalScore = (context: PolicyExecutionContext): number => {
  if (context.signals.length === 0) {
    return 10;
  }

  const total = context.signals.reduce((acc, signal) => acc + signal.severity * signal.confidence, 0);
  return toPercent(total / context.signals.length);
};

const computeDensityScore = (signals: readonly PolicyExecutionContext['signals'][number][]): number => {
  const total = signals.length;
  if (total === 0) {
    return 100;
  }

  const ratio = total / Math.max(1, contextMaxSignals(signals));
  return toPercent(100 - Math.min(100, ratio * 100));
};

const contextMaxSignals = (signals: readonly PolicyExecutionContext['signals'][number][]): number => {
  if (signals.length === 0) {
    return 1;
  }

  const maxObserved = Math.max(...signals.map((signal) => signal.severity));
  return maxObserved || 1;
};

const computeRiskScore = (context: PolicyExecutionContext): number => {
  const planPressure = context.readinessPlan.targets.length + context.program.steps.length;
  const readinessPenalty = context.readinessPlan.riskBand === 'red' ? 40 : context.readinessPlan.riskBand === 'amber' ? 20 : 0;
  return toPercent(100 - (planPressure * 5 + readinessPenalty));
};

const computeReadinessScore = (context: PolicyExecutionContext): number => {
  const constraints = context.session.constraints.maxRetries + context.session.constraints.timeoutMinutes;
  const parallelism = context.session.constraints.maxParallelism;
  const operatorRequired = context.session.constraints.operatorApprovalRequired ? 10 : 0;
  return toPercent(120 - constraints / 2 - parallelism * 8 - operatorRequired);
};

export const computePolicyScoreCard = (
  context: PolicyExecutionContext,
): PolicyScoreCard => {
  const signalScore = computeSignalScore(context);
  const densityScore = computeDensityScore(context.signals);
  const riskScore = computeRiskScore(context);
  const readinessScore = computeReadinessScore(context);
  const policyScore = policyDensity(context.session.signals.length);

  const compositeScore = toPercent(
    signalScore * 0.23 +
      densityScore * 0.23 +
      riskScore * 0.2 +
      readinessScore * 0.17 +
      policyScore * 0.17,
  );

  return {
    signalScore,
    policyScore,
    densityScore,
    riskScore,
    readinessScore,
    compositeScore,
  };
};

export const scoreTrend = (scores: readonly number[]): ReadonlyArray<{ at: string; score: number }> => {
  return scores.map((score, index) => ({
    at: new Date(Date.now() - (scores.length - index) * 60_000).toISOString(),
    score: toPercent(score),
  }));
};

export const scoreAsHealth = (scoreCard: PolicyScoreCard): 'green' | 'amber' | 'red' => {
  if (scoreCard.compositeScore >= 72) {
    return 'green';
  }
  if (scoreCard.compositeScore >= 44) {
    return 'amber';
  }
  return 'red';
};
