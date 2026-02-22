import type { RiskPosture, StrategyPlan, StrategySimulationWindow, StrategyPolicy } from './types';

export interface PolicyWeights {
  readonly riskReductionWeight: number;
  readonly speedWeight: number;
  readonly costWeight: number;
}

const BASE_WEIGHTS: PolicyWeights = {
  riskReductionWeight: 0.6,
  speedWeight: 0.25,
  costWeight: 0.15,
};

const posturePoints: Record<RiskPosture, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const normalizeWeights = (weights?: Partial<PolicyWeights>): PolicyWeights => {
  const merged = { ...BASE_WEIGHTS, ...(weights ?? {}) };
  const total = merged.riskReductionWeight + merged.speedWeight + merged.costWeight;
  if (total <= 0) {
    return { ...BASE_WEIGHTS };
  }

  return {
    riskReductionWeight: merged.riskReductionWeight / total,
    speedWeight: merged.speedWeight / total,
    costWeight: merged.costWeight / total,
  };
};

export const classifyPosture = (signals: readonly number[]): RiskPosture => {
  if (signals.length === 0) {
    return 'low';
  }

  const normalized = signals.reduce((sum, signal) => sum + signal, 0) / signals.length;
  if (normalized >= 0.8) return 'critical';
  if (normalized >= 0.6) return 'high';
  if (normalized >= 0.3) return 'medium';
  return 'low';
};

export const calculatePlanScore = (
  plan: StrategyPlan,
  posture: RiskPosture,
  policy: StrategyPolicy,
  weightsInput?: Partial<PolicyWeights>,
): number => {
  const weights = normalizeWeights(weightsInput);
  const commandCount = plan.windows.reduce((sum, window) => sum + window.commandCount, 0);
  const rto = plan.windows.length === 0 ? 0 : plan.windows[0]?.expectedRto ?? 0;
  const signalDensity =
    plan.windows.length === 0
      ? 0
      : plan.windows.reduce((sum, window) => sum + window.signalDensity, 0) / plan.windows.length;

  const posturePenalty = posturePoints[posture] / 4;
  const speedScore = rto > 0 ? 1 / rto : 0;
  const densityScore = commandCount > 0 ? 1 / commandCount : 0;
  const tokenPenalty = plan.windows.length >= policy.minimumRunbookTokens
    ? 0
    : (policy.minimumRunbookTokens - plan.windows.length) / Math.max(1, policy.minimumRunbookTokens);

  return Number(
    (
      weights.riskReductionWeight * (1 - posturePenalty) +
      weights.speedWeight * speedScore +
      weights.costWeight * Math.max(0, 1 - densityScore) -
      tokenPenalty * policy.commandCostPenalty
    ).toFixed(4),
  );
};

export const describeSimulationWindows = (windows: readonly StrategySimulationWindow[]): readonly string[] =>
  windows.map(
    (window) =>
      `${window.minuteOffset}m rto=${window.expectedRto} risk=${window.riskPosture} command=${window.commandCount} density=${window.signalDensity.toFixed(2)}`,
  );

export const summarizeByPosture = (plan: StrategyPlan): Record<RiskPosture, number> => {
  const buckets: Record<RiskPosture, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const window of plan.windows) {
    buckets[window.riskPosture] += 1;
  }

  const total = plan.windows.length || 1;
  return {
    low: buckets.low / total,
    medium: buckets.medium / total,
    high: buckets.high / total,
    critical: buckets.critical / total,
  };
};

export const topPriorityTokens = (plan: StrategyPlan, limit = 5): readonly string[] =>
  [...plan.windows]
    .sort((left, right) => right.expectedRto - left.expectedRto)
    .slice(0, limit)
    .map((window) => `${window.minuteOffset}-${window.riskPosture}`);
