import type { LabPlan, LabSignal, OrchestrationLab, OrchestrationPolicy } from './types';
import { evaluatePolicy, type PolicyViolation } from './policy';

export interface CandidateWindow {
  readonly index: number;
  readonly score: number;
  readonly candidate: LabPlan;
}

export interface OptimizationConstraint {
  readonly maxSteps: number;
  readonly includeAutomatedOnly: boolean;
  readonly minReversibleRatio: number;
}

export interface OptimizationResult {
  readonly sourceLabId: OrchestrationLab['id'];
  readonly policyId: OrchestrationPolicy['id'];
  readonly generatedAt: string;
  readonly ranked: readonly CandidateWindow[];
  readonly selectedPlanId?: LabPlan['id'];
  readonly rejected: readonly { readonly reason: string; readonly planId: LabPlan['id'] }[];
}

const normalizeStepCount = (plan: LabPlan, maxSteps: number): number => {
  if (maxSteps <= 0) {
    return 0;
  }
  const ratio = plan.steps.length / maxSteps;
  return Number((Math.max(0, 1 - ratio)).toFixed(3));
};

const reversibleRatio = (plan: LabPlan): number => {
  if (plan.steps.length === 0) {
    return 0;
  }
  const reversible = plan.steps.filter((step) => step.reversible).length;
  return reversible / plan.steps.length;
};

const confidenceBoost = (plan: LabPlan): number => (plan.confidence * 100);

const stepComplexityPenalty = (plan: LabPlan): number => {
  const riskSum = plan.steps.reduce((acc, step) => acc + step.risk, 0);
  return Math.max(0, riskSum / Math.max(1, plan.steps.length * 10));
};

const signalRelevance = (plan: LabPlan, signals: readonly LabSignal[]): number => {
  const scoreSum = signals.reduce((acc, signal) => acc + signal.score, 0);
  const avgSignal = signals.length === 0 ? 0 : scoreSum / signals.length;
  return clamp01((avgSignal * 0.6) + (plan.score * 0.4));
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const rejectionReason = (violations: readonly PolicyViolation[]): string => {
  const first = violations.find((entry) => entry.blocked);
  return first?.description ?? 'policy violation';
};

const weightedScore = (plan: LabPlan, signals: readonly LabSignal[], constraints: OptimizationConstraint): number => {
  const policyCheck = evaluatePolicy({
    id: 'plan-optimizer-policy' as OrchestrationPolicy['id'],
    tenantId: 'tenant',
    maxParallelSteps: constraints.maxSteps,
    minConfidence: 0.2,
    allowedTiers: ['signal', 'warning', 'critical'],
    minWindowMinutes: 8,
    timeoutMinutes: 240,
  }, plan);

  if (!policyCheck.allowed) {
    return -1;
  }

  const confidenceScore = confidenceBoost(plan);
  const signalScore = signalRelevance(plan, signals) * 100;
  const stepCountScore = normalizeStepCount(plan, constraints.maxSteps) * 100;
  const reversibleScore = reversibleRatio(plan) * 100;
  const complexityScore = (1 - stepComplexityPenalty(plan)) * 100;
  const automatedPenalty = constraints.includeAutomatedOnly
    ? plan.steps.every((step) => step.owner === 'automated') ? 0 : -20
    : 0;

  return Math.max(
    0,
    confidenceScore * 0.2 +
      signalScore * 0.25 +
      stepCountScore * 0.25 +
      reversibleScore * 0.15 +
      complexityScore * 0.15 +
      automatedPenalty,
  );
};

export const optimizePlanSelection = (
  lab: OrchestrationLab,
  policy: OrchestrationPolicy,
  constraints: OptimizationConstraint,
): OptimizationResult => {
  const ranked: CandidateWindow[] = [];
  const rejected: Array<{ reason: string; planId: LabPlan['id'] }> = [];

  for (let index = 0; index < lab.plans.length; index += 1) {
    const plan = lab.plans[index];
    const policyCheck = evaluatePolicy(policy, plan);
    if (!policyCheck.allowed) {
      rejected.push({ reason: rejectionReason(policyCheck.violations), planId: plan.id });
      continue;
    }

    const score = weightedScore(plan, lab.signals, constraints);
    if (score <= 0) {
      rejected.push({ reason: 'non-positive score', planId: plan.id });
      continue;
    }
    ranked.push({ index, score, candidate: plan });
  }

  const sorted = [...ranked].sort((left, right) => right.score - left.score);
  const top = sorted[0];

  return {
    sourceLabId: lab.id,
    policyId: policy.id,
    generatedAt: new Date().toISOString(),
    ranked: sorted,
    selectedPlanId: top?.candidate.id,
    rejected,
  };
};

export const splitByConstraints = (
  plans: readonly LabPlan[],
  constraints: OptimizationConstraint,
): { readonly feasible: readonly LabPlan[]; readonly filtered: readonly LabPlan[] } => {
  const feasible: LabPlan[] = [];
  const filtered: LabPlan[] = [];

  for (const plan of plans) {
    if (plan.steps.length <= constraints.maxSteps && reversibleRatio(plan) >= constraints.minReversibleRatio) {
      feasible.push(plan);
    } else {
      filtered.push(plan);
    }
  }

  return { feasible, filtered };
};

export const explainSelection = (result: OptimizationResult): string => {
  const top = result.ranked[0];
  const topId = top ? top.candidate.id : 'none';
  const topScore = top ? top.score.toFixed(2) : '0.00';
  return `source=${result.sourceLabId} selected=${topId} score=${topScore} rejected=${result.rejected.length}`;
};
