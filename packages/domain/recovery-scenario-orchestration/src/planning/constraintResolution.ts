import { clamp } from '@shared/util';
import type { ConstraintSnapshot, ScenarioConstraint, RecoverySignal, ScenarioIntent, OrchestratorContext } from '../types';

export interface ConstraintResolutionContext {
  readonly signalWindowMinutes: number;
  readonly recentSignals: readonly RecoverySignal[];
  readonly intent: ScenarioIntent;
}

export interface ConstraintCoverage {
  readonly total: number;
  readonly met: number;
  readonly violated: number;
  readonly unknown: number;
}

export interface ConstraintGap {
  readonly constraint: ScenarioConstraint;
  readonly score: number;
  readonly gap: number;
}

export interface ConstraintPlanInput {
  readonly constraints: readonly ScenarioConstraint[];
  readonly snapshots: readonly ConstraintSnapshot[];
  readonly signalData: readonly RecoverySignal[];
  readonly intent: ScenarioIntent;
  readonly context: OrchestratorContext;
}

export interface ConstraintResult {
  readonly coverage: ConstraintCoverage;
  readonly gaps: readonly ConstraintGap[];
  readonly recommendation: 'run' | 'throttle' | 'hold';
  readonly confidence: number;
}

const evaluateGap = (
  constraint: ScenarioConstraint,
  snapshotMap: ReadonlyMap<string, ConstraintSnapshot>,
  metricSamples: readonly RecoverySignal[],
): ConstraintGap => {
  const snapshot = snapshotMap.get(constraint.id) ?? null;
  if (!snapshot) {
    return {
      constraint,
      score: 0,
      gap: 1,
    };
  }

  const latestSignal = [...metricSamples]
    .reverse()
    .find((signal) => signal.metric === constraint.key);
  const signalValue = latestSignal?.value;
  if (signalValue === undefined) {
    return {
      constraint,
      score: snapshot.score,
      gap: snapshot.state === 'violated' ? 1 : 0.5,
    };
  }

  const delta = Math.abs(signalValue - constraint.threshold);
  const normalized = clamp(delta / Math.max(1, Math.abs(constraint.threshold)), 0, 2);
  const score = snapshot.state === 'met' ? 1 - normalized : normalized;
  return {
    constraint,
    score: clamp(score, 0, 1),
    gap: snapshot.state === 'met' ? 0 : score,
  };
};

export const buildConstraintCoverage = (snapshots: readonly ConstraintSnapshot[]): ConstraintCoverage => ({
  total: snapshots.length,
  met: snapshots.filter((snapshot) => snapshot.state === 'met').length,
  violated: snapshots.filter((snapshot) => snapshot.state === 'violated').length,
  unknown: snapshots.filter((snapshot) => snapshot.state === 'unknown').length,
});

export const resolveConstraintGaps = (input: ConstraintPlanInput): readonly ConstraintGap[] => {
  const snapshotMap = new Map<string, ConstraintSnapshot>();
  for (const snapshot of input.snapshots) {
    snapshotMap.set(snapshot.constraint.id, snapshot);
  }
  return input.constraints
    .map((constraint) => evaluateGap(constraint, snapshotMap, input.signalData))
    .sort((left, right) => right.score - left.score);
};

const scoreConfidence = (coverage: ConstraintCoverage, gaps: readonly ConstraintGap[]): number => {
  if (coverage.total === 0) return 0;
  const healthy = coverage.met / coverage.total;
  const unresolved = gaps.reduce((acc, gap) => acc + gap.gap, 0);
  const penalty = Math.min(1, unresolved / Math.max(1, gaps.length * 2));
  return clamp(healthy - penalty * 0.4 + 0.2 * Math.max(0.1, 1 - penalty), 0, 1);
};

export const deriveConstraintDecision = (input: ConstraintPlanInput): ConstraintResult => {
  const coverage = buildConstraintCoverage(input.snapshots);
  const gaps = resolveConstraintGaps(input);
  const confidence = scoreConfidence(coverage, gaps);

  const intentBonus = input.intent.label.length > 0 ? 0.1 : 0;
  const contextBonus = Math.min(1, input.context.tags.length * 0.05);
  const threshold = clamp(0.4 + intentBonus + contextBonus, 0, 1);

  const recommendation = confidence > threshold ? 'run' : confidence > threshold - 0.2 ? 'throttle' : 'hold';

  return {
    coverage,
    gaps,
    confidence: clamp(confidence, 0, 1),
    recommendation,
  };
};
