import { nanoid } from 'nanoid';
import type { CandidateDecision, DecisionAction, DecisionPlan, DecisionTraceStep, TInputTemplate } from './models';
import type { DecisionPolicyTemplate, PolicyTemplateId } from '@data/decision-catalog';

export interface SelectionPolicy {
  minScore: number;
  maxKeep: number;
}

const clampScore = (value: number): number => Math.min(100, Math.max(0, Math.round(value)));

export const rankCandidates = <TOutput>(
  candidates: ReadonlyArray<CandidateDecision<TOutput>>,
  policy: SelectionPolicy,
): Array<CandidateDecision<TOutput>> => {
  return [...candidates]
    .map((candidate): CandidateDecision<TOutput> => ({ ...candidate, score: clampScore(candidate.score) }))
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index) => index < policy.maxKeep && candidate.score >= policy.minScore);
};

export function createPlan<TInput extends TInputTemplate, TOutput>(
  template: DecisionPolicyTemplate,
  input: TInput,
  candidates: ReadonlyArray<CandidateDecision<TOutput>>,
  policy: SelectionPolicy,
): DecisionPlan<TInput, TOutput> {
  const ranked = rankCandidates(candidates, policy);
  const trace = ranked.map((candidate, index): DecisionTraceStep => ({
    nodeId: `candidate-${index}`,
    actor: template.nodes[index % template.nodes.length]?.actor ?? 'system',
    score: candidate.score,
  }));

  return {
    runId: `run-${nanoid()}` as DecisionPlan<TInput, TOutput>['runId'],
    policyId: template.id as PolicyTemplateId,
    template,
    input,
    candidates: ranked,
    trace,
  };
}

export const summarizeActors = (actions: ReadonlyArray<DecisionAction<unknown>>): string => {
  const counts = new Map<string, number>();
  for (const action of actions) {
    counts.set(action.actor, (counts.get(action.actor) ?? 0) + 1);
  }
  return [...counts.entries()].map(([actor, count]) => `${actor}:${count}`).join('|');
};
