import type { ConstraintSnapshot, ScenarioConstraint, ConstraintState } from './types';

export interface ConstraintContext {
  readonly signals: ReadonlyArray<{
    readonly metric: string;
    readonly value: number;
    readonly observedAt: string;
  }>;
  readonly timestamp: string;
}

const matchesMetric = (constraint: ScenarioConstraint, metric: string): boolean => constraint.key === metric;

export const scoreConstraint = (
  constraint: ScenarioConstraint,
  context: ConstraintContext,
): ConstraintSnapshot => {
  const latest = [...context.signals].reverse().find((signal) => matchesMetric(constraint, signal.metric));

  if (!latest) {
    return {
      constraint,
      score: 0,
      state: 'unknown',
      evaluatedAt: context.timestamp,
      windowMinutes: constraint.windowMinutes,
    };
  }

  const value = latest.value;
  const met =
    constraint.operator === 'gt'
      ? value > constraint.threshold
      : constraint.operator === 'gte'
        ? value >= constraint.threshold
        : constraint.operator === 'lt'
          ? value < constraint.threshold
          : constraint.operator === 'lte'
            ? value <= constraint.threshold
            : constraint.operator === 'eq'
              ? value === constraint.threshold
              : constraint.operator === 'ne'
                ? value !== constraint.threshold
                : value.toString().includes(constraint.threshold.toString());

  return {
    constraint,
    score: met ? 1 : 0,
    state: met ? 'met' : 'violated',
    observedValue: value,
    evaluatedAt: context.timestamp,
    windowMinutes: constraint.windowMinutes,
  };
};

export const hasBlockingConstraint = (snapshots: readonly ConstraintSnapshot[]): boolean =>
  snapshots.some((snapshot) => snapshot.state === 'violated');

export const constraintCoverage = (snapshots: readonly ConstraintSnapshot[]): Record<ConstraintState, number> =>
  snapshots.reduce(
    (acc, snapshot) => {
      acc[snapshot.state] += 1;
      return acc;
    },
    { met: 0, violated: 0, unknown: 0 } as Record<ConstraintState, number>,
  );

export const prioritizeSnapshots = (snapshots: readonly ConstraintSnapshot[]): readonly ConstraintSnapshot[] =>
  [...snapshots].sort((left, right) => {
    if (left.state === right.state) {
      return left.constraint.key.localeCompare(right.constraint.key);
    }
    if (left.state === 'violated') {
      return -1;
    }
    if (right.state === 'violated') {
      return 1;
    }
    return 0;
  });

export const constraintsToSnapshots = (
  blueprint: { readonly constraints: readonly ScenarioConstraint[] },
  signals: readonly { readonly metric: string; readonly value: number; readonly observedAt: string }[],
): readonly ConstraintSnapshot[] => {
  return blueprint.constraints.map((constraint) =>
    scoreConstraint(constraint, {
      signals,
      timestamp: new Date().toISOString(),
    }),
  );
};
