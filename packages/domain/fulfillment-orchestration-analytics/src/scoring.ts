import { WorkloadScenario, CandidateAllocation } from './models';

export interface ScoreContext {
  riskWeight: number;
  demandWeight: number;
  utilizationWeight: number;
}

export interface RankedCandidate {
  allocation: CandidateAllocation;
  score: number;
  rank: number;
}

const defaultWeights: ScoreContext = {
  riskWeight: 0.45,
  demandWeight: 0.35,
  utilizationWeight: 0.2,
};

export const scoreAllocationBundle = (allocations: readonly CandidateAllocation[], context?: Partial<ScoreContext>): readonly RankedCandidate[] => {
  const { riskWeight, demandWeight, utilizationWeight } = { ...defaultWeights, ...context };
  const scored = allocations.map((allocation) => {
    const risk = allocation.riskBand === 'critical' ? 1 : allocation.riskBand === 'high' ? 0.7 : allocation.riskBand === 'medium' ? 0.4 : 0.1;
    const demand = clamp(allocation.signal.observedDemand / Math.max(1, allocation.signal.baseDemand));
    const utilization = clamp(allocation.schedule.utilizationPercent / 100);
    const score = risk * riskWeight + demand * demandWeight + utilization * utilizationWeight;
    return { allocation, score, rank: 0 };
  });

  const ranked = scored
    .sort((left, right) => right.score - left.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return ranked;
};

export const scoreScenario = (scenario: WorkloadScenario): number => {
  const confidence = scenario.demandProfile.reduce((acc, value) => acc + value.confidence, 0) / Math.max(1, scenario.demandProfile.length);
  const signalDensity = scenario.demandProfile.reduce((acc, value) => acc + value.observedDemand, 0) / Math.max(1, scenario.windows.length);
  const strategyBias = scenario.strategy === 'burst' ? 1.2 : scenario.strategy === 'throttle' ? 0.7 : 1;
  const recommendationPenalty = scenario.recommendation.length * 0.1;
  return Number(((confidence * 40 + signalDensity + strategyBias * 10 - recommendationPenalty).toFixed(3)));
};

export const selectTopAllocation = (
  candidates: readonly RankedCandidate[],
): RankedCandidate | undefined => candidates.find((candidate) => candidate.rank === 1);

export const isAboveThreshold = (candidates: readonly RankedCandidate[], threshold: number): boolean =>
  candidates.some((candidate) => candidate.score >= threshold);

export const combineScores = (left: readonly RankedCandidate[], right: readonly RankedCandidate[]): readonly RankedCandidate[] => {
  const merged = new Map<string, RankedCandidate>();
  for (const item of [...left, ...right]) {
    const key = item.allocation.forecastId;
    const prev = merged.get(key);
    if (!prev || prev.score < item.score) {
      merged.set(key, item);
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).map((item, index) => ({ ...item, rank: index + 1 }));
};

const clamp = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 10) return 10;
  return Number(value.toFixed(3));
};
