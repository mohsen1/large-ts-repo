import type { NoInfer } from '@shared/type-level';
import type { LatticeContext } from './ids';

export type OperatorToken =
  | 'in'
  | 'notIn'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'ne'
  | 'regex'
  | 'within';

export type RouteCondition<T extends string> =
  | { operator: Extract<OperatorToken, 'in' | 'notIn'>; path: T; values: readonly string[] }
  | { operator: Extract<OperatorToken, 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne'>; path: T; value: number | string }
  | { operator: 'regex'; path: T; value: string }
  | { operator: 'within'; path: T; value: { left: number; right: number } };

export type ConstraintPolicy = 'allow' | 'deny' | 'observe';

export type ConstraintTuple<T extends string = string> = readonly [ConstraintPolicy, RouteCondition<T>];

export interface ConstraintGraphNode<TContext> {
  readonly id: string;
  readonly condition: RouteCondition<Extract<keyof TContext & string, string>>;
  readonly consequence: {
    readonly action: `policy:${ConstraintPolicy}`;
    readonly confidence: number;
  };
  readonly children: readonly ConstraintGraphNode<TContext>[];
}

export type ConstraintResult<T> = {
  readonly matched: boolean;
  readonly score: number;
  readonly details: readonly string[];
  readonly context: T;
};

export type NestedPath<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}` | `${K}.${NestedPath<T[K]>}`
    : `${K}`;
}[keyof T & string];

export const conditionKind = <T extends readonly RouteCondition<string>[]>(conditions: T): T => conditions;

export const inferPathConstraint = <TContext, TPath extends NestedPath<TContext> & string>(path: TPath): TPath => path;

const resolvePath = (value: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    const container = current as Record<string, unknown>;
    return container[segment];
  }, value);
};

const evalCondition = (value: unknown, condition: RouteCondition<string>): boolean => {
  switch (condition.operator) {
    case 'eq':
      return value === condition.value;
    case 'ne':
      return value !== condition.value;
    case 'gt':
      return Number(value) > Number((condition as { value: number | string }).value);
    case 'gte':
      return Number(value) >= Number((condition as { value: number | string }).value);
    case 'lt':
      return Number(value) < Number((condition as { value: number | string }).value);
    case 'lte':
      return Number(value) <= Number((condition as { value: number | string }).value);
    case 'in':
      return (condition.values as readonly unknown[]).includes(value);
    case 'notIn':
      return !(condition.values as readonly unknown[]).includes(value);
    case 'regex':
      return new RegExp(condition.value).test(String(value ?? ''));
    case 'within':
      const numeric = Number(value);
      return numeric >= condition.value.left && numeric <= condition.value.right;
    default:
      return false;
  }
};

export const evaluateConstraint = <
  TContext extends Record<string, unknown>,
  TCondition extends RouteCondition<NestedPath<TContext> & string>,
>(context: TContext, condition: NoInfer<TCondition>): ConstraintResult<TContext> => {
  const selected = resolvePath(context, condition.path as string);
  const matched = evalCondition(selected, condition);
  return {
    matched,
    score: matched ? 1 : 0,
    details: [`${condition.path}:${condition.operator}:${matched ? 'ok' : 'miss'}`],
    context,
  };
};

export const evaluatePolicy = <
  TContext extends Record<string, unknown>,
>(context: TContext, conditions: readonly ConstraintTuple<NestedPath<TContext> & string>[]): readonly ConstraintResult<TContext>[] => {
  return conditions.map(([policy, condition]) => {
    const result = evaluateConstraint(context, condition as RouteCondition<NestedPath<TContext> & string>);
    return {
      ...result,
      score: policy === 'allow' ? result.score : result.score / 2,
      details: [...result.details, `policy:${policy}`],
    };
  });
};

export const classifyPolicy = <
  TContext extends Record<string, unknown>,
>(
  context: TContext,
  conditions: readonly ConstraintTuple<NestedPath<TContext> & string>[],
): 'allow' | 'observe' | 'deny' => {
  const outcomes = evaluatePolicy(context, conditions);
  const denied = outcomes.some((entry) => entry.details.includes('policy:deny') && !entry.matched);
  const allowed = outcomes.some((entry) => entry.details.includes('policy:allow') && entry.matched);
  const observed = outcomes.some((entry) => entry.details.includes('policy:observe'));
  return denied ? 'deny' : allowed ? 'allow' : observed ? 'observe' : 'allow';
};

export const flattenConstraints = <
  TContext,
  TConstraints extends readonly ConstraintGraphNode<TContext>[],
>(
  constraints: NoInfer<TConstraints>,
): readonly ConstraintGraphNode<TContext>[] => {
  const output: ConstraintGraphNode<TContext>[] = [];
  const walk = (nodes: readonly ConstraintGraphNode<TContext>[]) => {
    for (const node of nodes) {
      output.push(node);
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(constraints);
  return output;
};

export interface ConstraintRunbook<TContext> {
  readonly tenant: LatticeContext['tenantId'];
  readonly policy: ConstraintPolicy;
  readonly constraints: readonly ConstraintGraphNode<TContext>[];
  readonly createdAt: string;
}
