import { normalizeLimit } from '@shared/core';
import { clamp } from './constraints';
import type {
  CoordinationConstraint,
  CoordinationPlanCandidate,
  CoordinationProgram,
  CoordinationStep,
} from './types';

export interface ConstraintQuality {
  readonly constraintId: string;
  readonly score: number;
  readonly status: 'good' | 'warn' | 'bad';
}

export interface StepQuality {
  readonly stepId: string;
  readonly score: number;
  readonly risk: number;
  readonly status: 'stable' | 'fragile' | 'critical';
}

export interface QualityProfile {
  readonly programId: CoordinationProgram['id'];
  readonly constraints: readonly ConstraintQuality[];
  readonly steps: readonly StepQuality[];
  readonly overall: number;
  readonly resilience: number;
  readonly riskGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export const summarizeQuality = (
  constraints: readonly CoordinationConstraint[],
  steps: readonly CoordinationStep[],
): number => {
  const constraintScore = constraints.length
    ? constraints.reduce((sum, constraint) => sum + constraintScoreValue(constraint), 0) / constraints.length
    : 1;
  const stepScore = steps.length
    ? steps.reduce((sum, step) => sum + stepQualityValue(step), 0) / steps.length
    : 1;
  return clamp((constraintScore + stepScore) / 2, 0, 1);
};

export const summarizeByStep = (steps: readonly CoordinationStep[]): readonly StepQuality[] => {
  const ranked = [...steps].sort((left, right) => right.durationSeconds - left.durationSeconds);
  return ranked.map((step, index) => {
    const risk = clamp(1 - step.criticality / 100, 0, 1);
    const score = stepQualityValue(step);
    return {
      stepId: step.id,
      score,
      risk,
      status: score >= 0.7 ? 'stable' : score >= 0.45 ? 'fragile' : 'critical',
    };
  });
};

export const constraintsProfile = (constraints: readonly CoordinationConstraint[]): readonly ConstraintQuality[] => {
  return constraints.map((constraint) => {
    const score = constraintScoreValue(constraint);
    return {
      constraintId: constraint.id,
      score,
      status: score >= 0.7 ? 'good' : score >= 0.45 ? 'warn' : 'bad',
    };
  });
};

export const summarizeProgramQuality = (program: CoordinationProgram): QualityProfile => {
  const constraintValues = constraintsProfile(program.constraints);
  const stepValues = summarizeByStep(program.steps);
  const overall = summarizeQuality(program.constraints, program.steps);
  const resilience = normalizeLimit(overall * 100) / 100;

  return {
    programId: program.id,
    constraints: constraintValues,
    steps: stepValues,
    overall,
    resilience,
    riskGrade: riskScoreToGrade(overall),
  };
};

export const createQualityGate = (
  candidate: CoordinationPlanCandidate,
  constraints: readonly CoordinationConstraint[],
): boolean => {
  const constraintDensity = constraints.length
    ? constraints.filter((constraint) => constraint.weight > 0.5).length / constraints.length
    : 0;
  return candidate.metadata.resilienceScore >= 0.2 && candidate.metadata.riskIndex <= (1 - constraintDensity);
};

export const computeRiskIndex = (constraints: readonly CoordinationConstraint[]): number => {
  if (!constraints.length) {
    return 0;
  }

  const sumWeights = constraints.reduce((sum, constraint) => sum + constraint.weight, 0);
  const maxWeight = Math.max(...constraints.map((constraint) => constraint.weight));
  return clamp(sumWeights / (constraints.length * 1.25 + maxWeight), 0, 1);
};

export const deriveProjection = (
  constraints: readonly CoordinationConstraint[],
): readonly { candidateId: string; tenant: string; score: number; phaseReadiness: number; riskAdjusted: number }[] =>
  constraints.map((constraint, index) => ({
    candidateId: constraint.id,
    tenant: constraint.scope,
    score: normalizeLimit(100 - constraint.weight * 100) / 100,
    phaseReadiness: clamp(constraint.affectedStepIds.length + index, 0, 100),
    riskAdjusted: 1 - constraint.weight,
  }));

const constraintScoreValue = (constraint: CoordinationConstraint): number => {
  const tagsWeight = clamp(constraint.tags.length / 8, 0, 1);
  const boundaryWeight = constraint.boundary ? clamp(constraint.boundary.hardLimit - constraint.boundary.softLimit, 0, 1) : 1;
  const weightPenalty = 1 - clamp(constraint.weight, 0, 1);
  return clamp((weightPenalty + tagsWeight + boundaryWeight) / 3, 0, 1);
};

const stepQualityValue = (step: CoordinationStep): number => {
  const base = clamp(1 - step.durationSeconds / 600, 0, 1);
  const fallback = clamp(1 - step.criticality / 100, 0, 1);
  const criticalityPenalty = clamp(1 - (step.tags.length / 10), 0, 1);
  return normalizeLimit((base * 0.5 + fallback * 0.3 + criticalityPenalty * 0.2) * 100) / 100;
};

const riskScoreToGrade = (score: number): QualityProfile['riskGrade'] => {
  if (score >= 0.9) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.55) return 'C';
  if (score >= 0.35) return 'D';
  return 'F';
};
