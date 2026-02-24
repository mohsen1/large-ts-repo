import type {
  CadencePlanCandidate,
  CadencePolicyConstraint,
  CadenceRunPlan,
  CadenceSlot,
  CadenceWindow,
} from './types';
import { calculateCoverage, calculateConcurrencyPeak, estimateAverageDuration, toNumeric } from './utility';

export type CadenceWorkloadVector = {
  readonly candidateCount: number;
  readonly windowCount: number;
  readonly slotCount: number;
  readonly constraintCount: number;
  readonly averageSlotWeight: number;
  readonly concurrentPeak: number;
  readonly windowCoverage: number;
};

export type CadencePlanScorecard = {
  readonly planId: CadenceRunPlan['id'];
  readonly runId: CadenceRunPlan['runId'];
  readonly score: number;
  readonly warnings: readonly string[];
  readonly riskBand: 'low' | 'medium' | 'high';
  readonly density: number;
};

export type CadenceExecutionReport = {
  readonly planId: CadenceRunPlan['id'];
  readonly plan: CadenceRunPlan;
  readonly workload: CadenceWorkloadVector;
  readonly topConstraints: readonly CadencePolicyConstraint[];
  readonly scorecard: CadencePlanScorecard;
  readonly windowDigest: readonly {
    readonly window: CadenceWindow;
    readonly slotCount: number;
    readonly totalMinutes: number;
    readonly density: number;
  }[];
};

const rankRisk = (score: number): 'low' | 'medium' | 'high' => {
  if (score >= 70) return 'low';
  if (score >= 40) return 'medium';
  return 'high';
};

const summarizeSlots = (slots: readonly CadenceSlot[]) => {
  const totalWeight = slots.reduce((acc, slot) => acc + slot.weight, 0);
  return {
    count: slots.length,
    averageWeight: Number((slots.length === 0 ? 0 : totalWeight / slots.length).toFixed(3)),
    maxEstMinutes: slots.reduce((acc, slot) => Math.max(acc, slot.estimatedMinutes), 0),
    totalEstMinutes: slots.reduce((acc, slot) => acc + slot.estimatedMinutes, 0),
  };
};

const buildWindowBuckets = (plan: CadenceRunPlan): CadenceExecutionReport['windowDigest'] =>
  plan.windows.map((window) => {
    const slots = plan.slots.filter((slot) => slot.windowId === window.id);
    return {
      window,
      slotCount: slots.length,
      totalMinutes: Number(slots.reduce((acc, slot) => acc + slot.estimatedMinutes, 0).toFixed(2)),
      density: Number((slots.length / Math.max(1, plan.slots.length)).toFixed(3)),
    };
  });

export const toCadenceWorkloadVector = (candidateOrPlan: CadencePlanCandidate | CadenceRunPlan): CadenceWorkloadVector => {
  if ('readinessScore' in candidateOrPlan) {
    const plan = candidateOrPlan;
    const slotSummary = summarizeSlots(plan.slots);

    return {
      candidateCount: 1,
      windowCount: plan.windows.length,
      slotCount: slotSummary.count,
      constraintCount: plan.policySummary.enabledConstraints,
      averageSlotWeight: slotSummary.averageWeight,
      concurrentPeak: calculateConcurrencyPeak(plan.slots),
      windowCoverage: calculateCoverage(plan.windows, plan.slots),
    };
  }

  const candidate = candidateOrPlan;
  const slotSummary = summarizeSlots(candidate.profile.slots);
  return {
    candidateCount: 1,
    windowCount: candidate.profile.windows.length,
    slotCount: slotSummary.count,
    constraintCount: candidate.constraints.length,
    averageSlotWeight: slotSummary.averageWeight,
    concurrentPeak: calculateConcurrencyPeak(candidate.profile.slots),
    windowCoverage: calculateCoverage(candidate.profile.windows, candidate.profile.slots),
  };
};

export const buildPlanScorecard = (plan: CadenceRunPlan): CadencePlanScorecard => {
  const topConstraintWeight = plan.policySummary.enabledConstraints;
  const signalDensity = calculateCoverage(plan.windows, plan.slots);
  const averageDuration = estimateAverageDuration(plan.slots);
  const score = Number((plan.readinessScore + (1 - signalDensity) * 30 + Math.min(30, topConstraintWeight * 4) - Math.max(0, averageDuration - 80)).toFixed(3));

  return {
    planId: plan.id,
    runId: plan.runId,
    score,
    warnings: [...plan.policySummary.warnings],
    riskBand: rankRisk(score),
    density: Number(signalDensity.toFixed(3)),
  };
};

export const rankCadencePlans = (plans: readonly CadenceRunPlan[]): CadenceRunPlan[] =>
  [...plans].sort((left, right) => buildPlanScorecard(right).score - buildPlanScorecard(left).score);

export const pickTopConstraintSignals = (
  candidates: readonly CadencePlanCandidate[],
  limit = 5,
): readonly CadencePolicyConstraint[] => {
  const constraints = candidates.flatMap((candidate) => candidate.constraints);
  const sorted = [...constraints].sort((left, right) => {
    const byWeight = right.weight - left.weight;
    if (byWeight !== 0) return byWeight;
    return String(left.id).localeCompare(String(right.id));
  });
  return sorted.slice(0, limit);
};

export const buildExecutionReport = (plan: CadenceRunPlan): CadenceExecutionReport => {
  const workload = toCadenceWorkloadVector(plan);
  const topConstraints = [...plan.policySummary.blockedByRules]
    .map((note, index): CadencePolicyConstraint => ({
      id: `runtime-${plan.id}-${index}` as CadencePolicyConstraint['id'],
      key: 'policy.blockedByRules',
      expression: `warning includes ${note}`,
      enabled: true,
      weight: 0.5,
    }))
    .slice(0, 10);

  return {
    planId: plan.id,
    plan,
    workload,
    topConstraints,
    scorecard: buildPlanScorecard(plan),
    windowDigest: buildWindowBuckets(plan).toSorted((left, right) => right.slotCount - left.slotCount || right.totalMinutes - left.totalMinutes),
  };
};

export const estimateRunCompletionMinutes = (plan: CadenceRunPlan): number => {
  const summary = summarizeSlots(plan.slots);
  const maxWindowParallelism = plan.windows.reduce((acc, window) => Math.max(acc, window.maxParallelism), 1);
  return Number((summary.totalEstMinutes / Math.max(1, maxWindowParallelism) + summary.maxEstMinutes * 0.2).toFixed(2));
};

export const normalizeDensity = (value: number): number => {
  const bounded = toNumeric(value, 0);
  return Number(Math.max(0, Math.min(1, bounded)).toFixed(3));
};
