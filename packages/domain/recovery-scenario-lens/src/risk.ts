import {
  ConstraintViolation,
  PlanCandidate,
  ScenarioConstraint,
  ScenarioPlan,
  ScenarioId,
  asMillis,
  asScenarioConstraintId,
  asScenarioPlanId,
  asCommandId,
} from './types';
import { mergeConstraintSets } from './graph';

export interface RiskDimension {
  readonly name: string;
  readonly score: number;
  readonly explanation: string;
}

export interface RiskEnvelope {
  readonly scenarioId: ScenarioId;
  readonly score: number;
  readonly summary: string;
  readonly dimensions: readonly RiskDimension[];
  readonly violations: readonly ConstraintViolation[];
}

export const scoreCandidate = (candidate: PlanCandidate): number => {
  const complexity = Math.log2(candidate.orderedCommandIds.length + 1);
  const variance = candidate.windows.reduce((acc, window) => {
    const delta = window.concurrency - 1;
    return acc + delta * delta;
  }, 0);
  const blastPenalty = candidate.risk * 2;
  return Math.max(0, 100 - complexity - variance - blastPenalty);
};

export const detectConstraintViolations = (
  candidate: PlanCandidate,
  constraints: readonly ScenarioConstraint[],
): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];
  for (const constraint of constraints) {
    if (constraint.type === 'max_parallelism') {
      const violated = candidate.windows.find((window) => window.concurrency > constraint.limit);
      if (violated?.commandIds[0]) {
        violations.push({
          ...constraint,
          commandId: violated.commandIds[0],
          observed: violated.concurrency,
        });
      }
      continue;
    }

    if (constraint.type === 'max_blast' && candidate.risk > constraint.limit) {
      violations.push({
        ...constraint,
        commandId: candidate.orderedCommandIds[0] ?? asCommandId('none'),
        observed: candidate.risk,
      });
    }
  }

  return violations;
};

export const rankPlans = (plans: readonly PlanCandidate[]): readonly PlanCandidate[] => {
  return [...plans].sort((a, b) => {
    if (b.score === a.score) {
      return a.resourceUse - b.resourceUse;
    }
    return b.score - a.score;
  });
};

export const choosePlan = (candidates: readonly PlanCandidate[]): PlanCandidate | undefined => {
  return rankPlans(candidates)[0];
};

export const toScenarioPlan = (candidate: PlanCandidate): ScenarioPlan => {
  const expectedFinishMs = asMillis(candidate.windows.reduce((acc) => acc + 1, 0) * 1000);
  return {
    planId: asScenarioPlanId(`plan-${candidate.candidateId}`),
    blueprintId: candidate.blueprintId,
    version: 1,
    commandIds: candidate.orderedCommandIds,
    createdAt: new Date().toISOString(),
    expectedFinishMs,
    score: candidate.score,
    constraints: mergeConstraintSets([], candidate.orderedCommandIds.map(() => ({
      constraintId: asScenarioConstraintId(`auto-max-window-${candidate.candidateId}`),
      type: 'must_complete_before',
      description: 'synthetic limit',
      severity: 'warning',
      commandIds: candidate.orderedCommandIds,
      limit: 1000,
    }))),
    warnings: [],
  };
};
