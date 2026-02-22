import { clamp } from './utils';
import type { PolicyWeights, RankedCandidate } from './types';
import type { PolicyBundle } from './types';

export interface StrategyPolicy {
  mode: 'deterministic' | 'weighted' | 'canary';
  maxCandidates: number;
  minScore: number;
}

const basePolicy: StrategyPolicy = {
  mode: 'weighted',
  maxCandidates: 12,
  minScore: 10,
};

export const deriveWeights = (tenantId: string, candidateCount: number): PolicyWeights => ({
  tenantFactor: clamp(tenantId.length / 12, 0.4, 2.0),
  priorityFactor: clamp((candidateCount > 0 ? 10 / candidateCount : 1), 0.2, 1.5),
  policyDensityFactor: clamp(Math.max(1, candidateCount), 1, 20) / 10,
});

export interface RankingInput {
  requestPriority: number;
  tenantId: string;
  candidates: ReadonlyArray<PolicyBundle>;
  mode?: StrategyPolicy['mode'];
}

export const chooseMode = (priority: number, candidateCount: number): StrategyPolicy['mode'] => {
  if (priority >= 8 && candidateCount > 20) return 'canary';
  if (priority >= 5) return 'weighted';
  return 'deterministic';
};

const withScores = (bundles: ReadonlyArray<PolicyBundle>, weights: PolicyWeights, mode: StrategyPolicy['mode']) =>
  bundles.map((bundle, index) => {
    const base = bundle.meta.weight * weights.policyDensityFactor * weights.priorityFactor + index;
    const tuned = mode === 'canary' ? base * 1.35 : mode === 'deterministic' ? base * 0.9 : base;
    return {
      value: bundle,
      score: Math.round(tuned * weights.tenantFactor),
    };
  });

export const rankCandidates = ({ candidates, requestPriority, tenantId, mode }: RankingInput): RankedCandidate<PolicyBundle>[] => {
  const selectedMode = mode ?? chooseMode(requestPriority, candidates.length);
  const policy: StrategyPolicy = {
    ...basePolicy,
    mode: selectedMode,
  };

  const weights = deriveWeights(tenantId, candidates.length);
  const scoreList = withScores(candidates, weights, policy.mode);

  const sorted = scoreList
    .filter((entry) => entry.score >= policy.minScore)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.value.meta.policyId.localeCompare(right.value.meta.policyId);
    })
    .slice(0, policy.maxCandidates)
    .map((entry, index) => ({
      value: entry.value,
      score: entry.score,
      rank: index + 1,
    }));

  if (sorted.length > 0) return sorted;

  return scoreList.slice(0, 1).map((entry) => ({ value: entry.value, score: entry.score, rank: 1 }));
};

export const selectPrimaryCandidate = (ranked: RankedCandidate<PolicyBundle>[]): PolicyBundle | undefined => ranked[0]?.value;
