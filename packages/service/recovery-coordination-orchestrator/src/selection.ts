import type { CoordinationSelectionResult } from '@domain/recovery-coordination';
import type { CoordinationPlanCandidate } from '@domain/recovery-coordination';

export interface CandidateDecisionLog {
  readonly selected: string;
  readonly alternatives: readonly string[];
  readonly reasons: readonly string[];
  readonly score: number;
}

export interface SelectionInput {
  readonly selected: CoordinationPlanCandidate;
  readonly alternatives: readonly CoordinationPlanCandidate[];
  readonly policyDecision: string[];
  readonly riskSignals: readonly string[];
}

export interface SelectionOutput {
  readonly selectedId: CoordinationPlanCandidate['id'];
  readonly decision: CoordinationSelectionResult['decision'];
  readonly blockers: readonly string[];
  readonly confidence: number;
}

export const selectCandidateByPolicy = (
  candidates: readonly CoordinationPlanCandidate[],
): CoordinationPlanCandidate => {
  return candidates
    .slice()
    .sort((left, right) => right.metadata.resilienceScore - left.metadata.resilienceScore)
    .at(0) as CoordinationPlanCandidate;
};

export const buildSelectionDecision = (input: SelectionInput): SelectionOutput => {
  const blockedByPolicy = input.policyDecision.filter((entry) => entry.includes('block'));
  const riskPenalty = input.riskSignals.length;
  const confidence = Math.max(0, input.selected.metadata.resilienceScore * 100 - riskPenalty);

  return {
    selectedId: input.selected.id,
    decision: blockedByPolicy.length > 0
      ? 'blocked'
      : confidence >= 50 && riskPenalty < 3
        ? 'approved'
        : 'deferred',
    blockers: blockedByPolicy,
    confidence,
  };
};

export const toDecisionLog = (input: SelectionOutput, result: CoordinationSelectionResult): CandidateDecisionLog => ({
  selected: input.selectedId,
  alternatives: [result.selectedCandidate.id, ...result.alternatives.map((candidate) => candidate.id)],
  reasons: input.blockers,
  score: input.confidence,
});

export const compareCandidates = (
  left: CoordinationPlanCandidate,
  right: CoordinationPlanCandidate,
): number => right.metadata.resilienceScore - left.metadata.resilienceScore;

export const normalizeAlternatives = (
  candidate: CoordinationPlanCandidate,
): readonly CoordinationPlanCandidate[] => [
  candidate,
  {
    ...candidate,
    id: `${candidate.id}:fallback`,
    metadata: {
      ...candidate.metadata,
      resilienceScore: Math.max(0, candidate.metadata.resilienceScore - 0.1),
      riskIndex: Math.max(0, candidate.metadata.riskIndex - 0.1),
    },
  },
 ];
