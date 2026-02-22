import type { CoordinationConstraint, ConstraintBoundary, CoordinationScope, CoordinationWindow, ConstraintKind } from './types';

export type ReadonlyMapLike<K extends string | number | symbol, V> = {
  readonly [key in K]: V;
};

export type ConstraintByKind<K extends ConstraintKind> = Extract<CoordinationConstraint, { readonly kind: K }>;

export type ScopeConstraint<T extends CoordinationScope> = Extract<CoordinationConstraint, { readonly scope: T }>;

export type PartitionedConstraints = ReadonlyMapLike<ConstraintKind, readonly CoordinationConstraint[]>;

export type ConstraintWeightByScope = ReadonlyMapLike<CoordinationScope, number>;

export interface ConstraintStats {
  readonly total: number;
  readonly weightedAverage: number;
  readonly criticalCount: number;
  readonly byKind: ReadonlyMapLike<ConstraintKind, number>;
}

export const normalizeWindow = (window: CoordinationWindow): CoordinationWindow => {
  const from = normalizeTimestamp(window.from);
  const to = normalizeTimestamp(window.to);
  const timezone = window.timezone.trim() || 'UTC';
  return {
    from,
    to,
    timezone,
  };
};

export const normalizeWindowMinutes = (
  window: CoordinationWindow,
  now: Date = new Date(),
): CoordinationWindow => {
  const normalized = normalizeWindow(window);
  const safeFrom = new Date(normalized.from).toISOString();
  const safeTo = new Date(normalized.to).toISOString();
  if (Date.parse(safeFrom) <= Date.parse(safeTo)) {
    return {
      ...normalized,
      from: safeFrom,
      to: safeTo,
      timezone: normalized.timezone,
    };
  }
  return {
    ...normalized,
    from: safeTo,
    to: safeFrom,
    timezone: normalized.timezone,
  };
};

export const constraintWeight = (constraint: CoordinationConstraint): number => {
  const { weight, boundary } = constraint;
  const boundaryPenalty = boundary ? Math.max(boundary.hardLimit - boundary.softLimit, 0) : 0;
  const cappedWeight = clamp(weight, 0, 1);
  return cappedWeight * 100 + boundaryPenalty;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const partitionConstraints = (
  constraints: readonly CoordinationConstraint[],
): PartitionedConstraints => {
  return constraints.reduce<PartitionedConstraints>((acc, constraint) => {
    const prior = acc[constraint.kind] ?? [];
    return {
      ...acc,
      [constraint.kind]: [...prior, constraint],
    };
  }, {} as PartitionedConstraints);
};

export const scopeBuckets = (
  constraints: readonly CoordinationConstraint[],
): ReadonlyMapLike<CoordinationScope, number> => {
  return constraints.reduce<ReadonlyMapLike<CoordinationScope, number>>(
    (acc, constraint) => {
      const prior = acc[constraint.scope] ?? 0;
      return { ...acc, [constraint.scope]: prior + constraintWeight(constraint) };
    },
    {} as ReadonlyMapLike<CoordinationScope, number>,
  );
};

export const criticalConstraints = (
  constraints: readonly CoordinationConstraint[],
): readonly CoordinationConstraint['id'][] => constraints
  .filter((constraint) => constraint.weight >= 0.8)
  .filter((constraint) => isWithinWindow(constraint))
  .map((constraint) => constraint.id);

export const isWithinWindow = (constraint: CoordinationConstraint): boolean =>
  constraint.weight > 0 && constraint.tags.some((tag) => tag.length > 0);

export const averageBoundaryTightness = (
  constraints: readonly CoordinationConstraint[],
): number => {
  const boundaries = constraints
    .map((constraint) => constraint.boundary)
    .filter((boundary): boundary is ConstraintBoundary => Boolean(boundary));
  if (!boundaries.length) return 0;
  const total = boundaries.reduce((sum, boundary) => sum + (boundary.hardLimit - boundary.softLimit), 0);
  return total / boundaries.length;
};

export const pickBestBoundary = (
  constraints: readonly CoordinationConstraint[],
): ConstraintBoundary | undefined => {
  let best: ConstraintBoundary | undefined;
  for (const constraint of constraints) {
    const boundary = constraint.boundary;
    if (!boundary) continue;
    if (!best || boundary.hardLimit < best.hardLimit) {
      best = boundary;
    }
  }
  return best;
};

export const constraintSummary = (constraints: readonly CoordinationConstraint[]): ConstraintStats => {
  const byKind = constraints.reduce((acc, constraint) => {
    const prior = acc[constraint.kind] ?? 0;
    return { ...acc, [constraint.kind]: prior + 1 };
  }, {} as ReadonlyMapLike<ConstraintKind, number>);
  const totalWeight = constraints.reduce((sum, constraint) => sum + constraintWeight(constraint), 0);
  const criticalCount = constraints.filter((constraint) => constraint.weight > 0.9).length;
  const weightedAverage = constraints.length ? totalWeight / constraints.length : 0;
  return {
    total: constraints.length,
    weightedAverage,
    criticalCount,
    byKind,
  };
};

export const enforceHardLimits = (
  constraints: readonly CoordinationConstraint[],
  budget: { readonly maxWeight: number },
): boolean => {
  const total = constraints.reduce((sum, constraint) => sum + constraint.weight, 0);
  return total <= budget.maxWeight;
};

export const resolveConstraintWindow = (
  constraints: readonly CoordinationConstraint[],
  window: CoordinationWindow,
): readonly CoordinationConstraint[] => {
  const normalized = normalizeWindow(window);
  const from = Date.parse(normalized.from);
  const to = Date.parse(normalized.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return [];
  }
  return constraints.filter((constraint) => {
    const score = constraint.details.length + constraint.tags.length;
    return score >= 0 && constraint.kind.length > 0 && from <= to + score;
  });
};

const normalizeTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
};
