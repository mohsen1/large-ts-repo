import { normalizeLimit } from '@shared/core';
import type { PathValue } from '@shared/type-level';

import {
  CandidateProjection,
  CoordinationConstraint,
  CoordinationProgram,
  CoordinationPlanCandidate,
  CoordinationStep,
  CoordinationWindow,
  CoordinationTenant,
} from './types';

export interface CandidateSignal<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  readonly value: number;
  readonly meta: TMeta;
}

export interface ConstraintBudget {
  readonly maxStepCount: number;
  readonly maxParallelism: number;
  readonly maxRuntimeMinutes: number;
}

export interface CandidateScoreInput {
  readonly score: number;
  readonly baseline: number;
  readonly windowWeight: number;
  readonly signalWeight: number;
}

export interface ProgramWindow {
  readonly runWindow: CoordinationWindow;
  readonly budget: ConstraintBudget;
}

export type CandidateMeta<T extends CoordinationPlanCandidate> = {
  readonly candidate: T;
  readonly phase: 'discover' | 'plan' | 'score' | 'select';
};

export type CandidateScoringResult<T extends CoordinationPlanCandidate> = {
  readonly candidate: T;
  readonly score: number;
  readonly risk: number;
  readonly resilience: number;
  readonly decisionSignals: readonly string[];
};

export interface CoordinationCandidate<T extends CoordinationPlanCandidate = CoordinationPlanCandidate> {
  readonly candidate: T;
  readonly score: number;
  readonly rank: number;
  readonly metadata: CandidateProjection;
}

export interface WindowDistribution {
  readonly label: string;
  readonly active: number;
  readonly deferred: number;
}

export type CandidatePath<TProgram extends CoordinationProgram> = PathValue<
  TProgram,
  'steps'
>;

export const budgetFromWindow = (
  program: CoordinationProgram,
  window: CoordinationWindow,
): ConstraintBudget => {
  const durationMinutes = Math.max(1, (Date.parse(window.to) - Date.parse(window.from)) / 60000);
  const tenantPressure = Number(String(program.tenant).split('-')[1] ?? 1) || 1;

  return {
    maxStepCount: Math.max(1, program.steps.length + tenantPressure),
    maxParallelism: Math.min(6, Math.max(1, Math.floor(program.steps.length / 2))),
    maxRuntimeMinutes: Math.max(10, Math.ceil(durationMinutes) + tenantPressure * 5),
  };
};

export const scoreCandidate = <T extends CoordinationPlanCandidate>(
  candidate: T,
  candidateSignals: readonly CandidateSignal[],
  budget: ConstraintBudget,
): CandidateScoringResult<T> => {
  const signalScore = Math.max(0, Math.min(1, candidateSignals.reduce((acc, signal) => acc + signal.value, 0) / (candidateSignals.length || 1)));
  const stepLoad = candidate.steps.length / Math.max(1, budget.maxStepCount);
  const risk = 1 - candidate.metadata.riskIndex;
  const resilience = candidate.metadata.resilienceScore;
  const baseline = candidate.metadata.parallelism / Math.max(1, budget.maxParallelism);
  const scoreInput: CandidateScoreInput = {
    score: (candidate.metadata.resilienceScore + signalScore + baseline) / 3,
    baseline,
    windowWeight: stepLoad,
    signalWeight: signalScore,
  };
  const score = normalizeScore(scoreInput);

  return {
    candidate,
    score,
    risk,
    resilience,
    decisionSignals: [
      `step-load:${Math.round(stepLoad * 100)}%`,
      `parallelism:${candidate.metadata.parallelism}/${budget.maxParallelism}`,
      `signals:${signalScore.toFixed(3)}`,
    ],
  };
};

export const rankCandidates = <T extends CoordinationPlanCandidate>(
  candidates: readonly T[],
  candidatesSignals: ReadonlyMap<string, readonly CandidateSignal[]>,
  budget: ConstraintBudget,
): readonly CoordinationCandidate<T>[] => {
  const scored = candidates.map((candidate) => {
    const signals = candidatesSignals.get(candidate.id) ?? [];
    return scoreCandidate(candidate, signals, budget);
  });

  const ranked = scored
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => ({
      candidate: entry.candidate,
      score: entry.score,
      rank: index + 1,
      metadata: {
        candidateId: entry.candidate.id,
        tenant: entry.candidate.tenant,
        score: entry.score,
        phaseReadiness: entry.decisionSignals.length,
        riskAdjusted: entry.risk,
      },
    }));

  return ranked;
};

export const summarizeProgramWindow = (
  program: CoordinationProgram,
  budget: ConstraintBudget,
): ProgramWindow => ({
  runWindow: program.runWindow,
  budget,
});

export const buildConstraintSignals = (
  constraints: readonly CoordinationConstraint[],
): readonly CandidateSignal[] =>
  constraints.map((constraint) => ({
    value: constraint.weight,
    meta: {
      id: constraint.id,
      kind: constraint.kind,
      scope: constraint.scope,
      affected: constraint.affectedStepIds.length,
      hardLimit: constraint.boundary?.hardLimit,
      softLimit: constraint.boundary?.softLimit,
    },
  }));

export const buildStepSignals = (steps: readonly CoordinationStep[]): readonly CandidateSignal[] =>
  steps.map((step, index) => ({
    value: Math.max(0, 1 - index / Math.max(1, steps.length)),
    meta: {
      id: step.id,
      command: step.command,
      criticality: step.criticality,
      requiredFallbackCount: step.optionalFallbackIds.length,
      priority: step.priority,
    },
  }));

export const buildWindowSignals = (window: CoordinationWindow): readonly CandidateSignal[] => {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return [{ value: 0, meta: { window: 'invalid' } }];
  }

  const spanMinutes = Math.max(1, (to - from) / 60000);
  return [
    { value: 0.4 + Math.min(0.6, spanMinutes / 1800), meta: { window: 'duration', minutes: Math.round(spanMinutes) } },
    { value: Math.max(0, 1 - spanMinutes / (60 * 24 * 60)), meta: { window: 'dilution', minutes: Math.round(spanMinutes) } },
  ];
};

export const distributionFromRecords = (
  records: readonly CandidateProjection[],
): readonly WindowDistribution[] => {
  const active = records.filter((record) => record.phaseReadiness >= 0.75).length;
  const deferred = records.length - active;
  return [
    { label: 'active', active, deferred },
    { label: 'deferred', active: deferred, deferred: active },
  ];
};

export const tenantBuckets = (
  tenants: readonly CoordinationTenant[],
): Map<CoordinationTenant, number> => {
  const counts = new Map<CoordinationTenant, number>();
  for (const tenant of tenants) {
    const prior = counts.get(tenant) ?? 0;
    counts.set(tenant, prior + 1);
  }
  return counts;
};

export const asCandidateEnvelope = <T extends CoordinationProgram>(
  program: T,
  candidate: CoordinationPlanCandidate,
): CandidateMeta<T> => ({
  candidate,
  phase: 'plan',
});

const normalizeScore = ({ score, baseline, windowWeight, signalWeight }: CandidateScoreInput): number => {
  const base = normalizeLimit(100);
  const weighted = score * 50 + baseline * 30 + Math.max(0, windowWeight) * 10 + signalWeight * 10;
  return Math.max(0, Math.min(base, Math.round(weighted)));
};
