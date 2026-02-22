import type { CoordinationSelectionResult } from '@domain/recovery-coordination';
import type { RecoveryPlanCandidate } from '@domain/recovery-plan';

export interface CandidateDecisionLog {
  readonly selected: string;
  readonly alternatives: readonly string[];
  readonly reasons: readonly string[];
  readonly score: number;
}

export interface SelectionInput {
  readonly selected: RecoveryPlanCandidate;
  readonly alternatives: readonly RecoveryPlanCandidate[];
  readonly policyDecision: string[];
  readonly riskSignals: readonly string[];
}

export interface SelectionOutput {
  readonly selectedId: string;
  readonly decision: CoordinationSelectionResult['decision'];
  readonly blockers: readonly string[];
  readonly confidence: number;
}

export const selectCandidateByPolicy = (candidates: readonly RecoveryPlanCandidate[]): RecoveryPlanCandidate => {
  return candidates
    .slice()
    .sort((left, right) => right.metadata.confidence - left.metadata.confidence)
    .at(0) as RecoveryPlanCandidate;
};

export const buildSelectionDecision = (input: SelectionInput): SelectionOutput => {
  const blockedByPolicy = input.policyDecision.filter((entry) => entry.includes('block'));
  const riskPenalty = input.riskSignals.length;
  const confidence = Math.max(0, input.selected.metadata.confidence - riskPenalty);

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
  left: RecoveryPlanCandidate,
  right: RecoveryPlanCandidate,
): number => right.metadata.confidence - left.metadata.confidence;

export const normalizeAlternatives = (
  candidate: RecoveryPlanCandidate,
): readonly RecoveryPlanCandidate[] => [
  candidate,
  {
    ...candidate,
    id: `${candidate.id}:fallback`,
    route: {
      ...candidate.route,
      id: `${candidate.route.id}:fallback`,
    },
    metadata: {
      ...candidate.metadata,
      estimatedMinutes: candidate.estimatedMinutes + 2,
      confidence: Math.max(1, candidate.metadata.confidence - 3),
      blockingPolicyCount: candidate.blockingPolicyCount + 0,
      rationale: [...candidate.rationale, 'normalized-fallback'],
    },
  },
 ];
