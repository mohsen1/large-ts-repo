import { PolicyArtifact } from './models';

export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'startsWith' | 'endsWith' | 'contains';

export interface BaseConstraint {
  field: string;
  value: unknown;
  negate: boolean;
}

export interface ComparisonConstraint extends BaseConstraint {
  op: ComparisonOperator;
}

export interface PresenceConstraint extends BaseConstraint {
  op: 'present' | 'absent';
  value: true;
}

export interface TemporalConstraint extends BaseConstraint {
  op: 'after' | 'before';
  value: string;
}

export type PolicyConstraint = ComparisonConstraint | PresenceConstraint | TemporalConstraint;

export interface ConstraintSet {
  artifactId: PolicyArtifact['id'];
  all: readonly PolicyConstraint[];
}

const isNumberLike = (value: unknown): value is number =>
  typeof value === 'number' || value instanceof Number;

const asComparableString = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value) ?? '';

export const evaluateOperator = (lhs: unknown, rhs: unknown, op: ComparisonOperator): boolean => {
  switch (op) {
    case 'eq':
      return lhs === rhs;
    case 'neq':
      return lhs !== rhs;
    case 'gt':
      if (!isNumberLike(lhs) || !isNumberLike(rhs)) return false;
      return Number(lhs) > Number(rhs);
    case 'gte':
      if (!isNumberLike(lhs) || !isNumberLike(rhs)) return false;
      return Number(lhs) >= Number(rhs);
    case 'lt':
      if (!isNumberLike(lhs) || !isNumberLike(rhs)) return false;
      return Number(lhs) < Number(rhs);
    case 'lte':
      if (!isNumberLike(lhs) || !isNumberLike(rhs)) return false;
      return Number(lhs) <= Number(rhs);
    case 'in':
      return Array.isArray(rhs) ? rhs.includes(lhs) : false;
    case 'startsWith':
      return asComparableString(lhs).startsWith(asComparableString(rhs));
    case 'endsWith':
      return asComparableString(lhs).endsWith(asComparableString(rhs));
    case 'contains':
      if (Array.isArray(lhs)) return lhs.includes(rhs);
      return asComparableString(lhs).includes(asComparableString(rhs));
    default:
      return false;
  }
};

const evaluateTemporal = (value: unknown, rhs: string, op: TemporalConstraint['op']): boolean => {
  if (typeof value !== 'string') return false;
  const left = new Date(value).getTime();
  const right = new Date(rhs).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return op === 'after' ? left > right : left < right;
};

export const evaluateConstraint = (constraint: PolicyConstraint, attributes: Record<string, unknown>): boolean => {
  const actual = attributes[constraint.field];

  const matches = (() => {
    if (constraint.op === 'present') return Object.prototype.hasOwnProperty.call(attributes, constraint.field);
    if (constraint.op === 'absent') return !Object.prototype.hasOwnProperty.call(attributes, constraint.field);
    if (constraint.op === 'after' || constraint.op === 'before') {
      return evaluateTemporal(actual, String(constraint.value), constraint.op);
    }
    return evaluateOperator(actual, constraint.value, constraint.op);
  })();

  return constraint.negate ? !matches : matches;
};

export const evaluateConstraintSet = (set: ConstraintSet, attributes: Record<string, unknown>): boolean => {
  return set.all.every((constraint) => evaluateConstraint(constraint, attributes));
};

export const mergeConstraintSets = (...sets: readonly ConstraintSet[]): ConstraintSet[] => {
  const map = new Map<string, PolicyConstraint[]>();
  for (const set of sets) {
    const items = map.get(set.artifactId) ?? [];
    map.set(set.artifactId, [...items, ...set.all]);
  }
  return Array.from(map, ([artifactId, all]) => ({
    artifactId: artifactId as PolicyArtifact['id'],
    all,
  }));
};

export const normalizeConstraint = (input: ConstraintSet): ConstraintSet => ({
  artifactId: input.artifactId,
  all: input.all.map((entry) => {
    const normalizedField = entry.field.trim();
    const normalizedNegate = !!entry.negate;
    if (entry.op === 'present' || entry.op === 'absent') {
      const normalized: PresenceConstraint = {
        field: normalizedField,
        op: entry.op,
        value: true,
        negate: normalizedNegate,
      };
      return normalized;
    }
    if (entry.op === 'after' || entry.op === 'before') {
      const temporal: TemporalConstraint = {
        field: normalizedField,
        op: entry.op,
        value: typeof entry.value === 'string' && Number.isFinite(new Date(entry.value).getTime()) ? entry.value : new Date(0).toISOString(),
        negate: normalizedNegate,
      };
      return temporal;
    }
    const comparison: ComparisonConstraint = {
      field: normalizedField,
      op: entry.op,
      value: entry.value,
      negate: normalizedNegate,
    };
    return comparison;
  }),
});

export const hasBlockingConstraint = (set: ConstraintSet): boolean =>
  set.all.some((item) => item.op === 'absent' || (item.op === 'eq' && item.value === 'deny'));

export const diffConstraints = (left: ConstraintSet, right: ConstraintSet): ConstraintSet[] => {
  const added: ConstraintSet[] = [];
  const removed: ConstraintSet[] = [];
  if (left.artifactId === right.artifactId) {
    const base = new Map<string, PolicyConstraint>();
    for (const item of left.all) base.set(`${item.field}:${item.op}:${String(item.value)}:${item.negate}`, item);
    for (const item of right.all) {
      const key = `${item.field}:${item.op}:${String(item.value)}:${item.negate}`;
      if (!base.has(key)) {
        added.push({ artifactId: right.artifactId, all: [item] });
      }
    }
    const next = new Map<string, PolicyConstraint>();
    for (const item of right.all) next.set(`${item.field}:${item.op}:${String(item.value)}:${item.negate}`, item);
    for (const item of left.all) {
      const key = `${item.field}:${item.op}:${String(item.value)}:${item.negate}`;
      if (!next.has(key)) {
        removed.push({ artifactId: left.artifactId, all: [item] });
      }
    }
  }
  return [...added, ...removed];
};
