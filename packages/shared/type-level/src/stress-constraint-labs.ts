import type { NoInfer } from './patterns';
import { fail, ok, type Result } from '@shared/result';

export type ConstraintRecord = Record<string, unknown>;

export type ConstraintState<T extends string> = {
  readonly label: T;
  readonly active: boolean;
};

type BuildDepth<T extends number, A extends unknown[] = []> = A['length'] extends T
  ? A
  : BuildDepth<T, [...A, unknown]>;

type Decrement<T extends number> = T extends 0 ? 0 : BuildDepth<T> extends [unknown, ...infer R] ? R['length'] : never;

export type ConstraintChain<A extends ConstraintRecord, B extends A, C extends Record<string, A>> = {
  readonly a: A;
  readonly b: B;
  readonly c: C;
};

export type ConstraintTuple<A extends ConstraintRecord, B extends A, C extends Record<string, A>> = [
  ConstraintState<'A'>,
  ConstraintState<'B'>,
  ConstraintState<'C'>,
  ConstraintChain<A, B, C>,
];

export type ConstraintResolver<
  A extends ConstraintRecord,
  B extends A,
  C extends Record<string, A>,
  N extends number = 12,
> = N extends 0
  ? ConstraintTuple<A, B, C>
  : [ConstraintState<`lvl-${N}`>, ...ConstraintResolver<A, B, C, Decrement<N>>];

export type ConstraintPick<T extends Record<string, unknown>> = {
  [K in keyof T]: K;
}[keyof T];

export type BrandedConstraint<T, B extends string> = T & { readonly __brand: B };

export type ConditionalConstraint<T> = T extends string
  ? T extends `${infer _A}/${infer _B}`
    ? { route: T; path: true }
    : { route: T; path: false }
  : { route: 'unknown'; path: false };

export type ConstraintUnion<T extends ConstraintRecord> = keyof T extends never
  ? never
  : ConstraintState<Exclude<Extract<keyof T, string>, ''>>;

export type SolverOutput<T extends ConstraintRecord> = {
  readonly solved: boolean;
  readonly input: T;
  readonly steps: readonly string[];
};

export const isSolverPass = <T extends ConstraintState<string>>(state: T): boolean => state.active && state.label.length > 0;

export const enforceConstraint = <A extends ConstraintRecord, B extends A, C extends Record<string, A>>(
  a: A,
  b: B,
  c: C,
): ConstraintChain<A, B, C> => ({ a, b, c });

export const solveConstraintChain = <A extends ConstraintRecord, B extends A, C extends Record<string, A>>(
  input: ConstraintChain<A, B, C>,
  steps: readonly string[],
): SolverOutput<ConstraintChain<A, B, C>> => {
  return {
    solved: true,
    input: input as unknown as SolverOutput<ConstraintChain<A, B, C>>['input'],
    steps,
  };
};

export const resolveInvariants = <A extends ConstraintRecord, B extends A, C extends Record<string, A>>(
  chain: ConstraintChain<A, B, C>,
): Result<ConstraintResolver<A, B, C>, Error> => {
  const solved = Object.keys(chain.a).length > 0 && Object.keys(chain.c).length > 0;
  if (!solved) {
    return fail(new Error('constraint failure'), 'SOLVER_FAIL');
  }
  return ok([
    { label: 'A', active: true },
    { label: 'B', active: true },
    { label: 'C', active: true },
    chain,
  ] as unknown as ConstraintResolver<A, B, C>);
};

export type ConstrainTemplate<
  T extends string,
  A extends ConstraintRecord,
  B extends A,
  C extends Record<string, A>,
> = T extends `/${infer Domain}/${infer Action}/${infer Resource}`
  ? Domain extends ConstraintPick<A>
    ? Resource extends ConstraintPick<C>
      ? {
          readonly domain: Domain & string;
          readonly action: Action & string;
          readonly resource: Resource & string;
          readonly chain: ConstraintChain<A, B, C>;
          readonly brand: BrandedConstraint<A, 'ConstraintTemplate'>;
        }
      : never
    : never
  : never;

type ConstraintFn<T extends string> = <
  const A extends ConstraintRecord,
  B extends A,
  C extends Record<string, A>,
>(input: A, route: T) => ConstrainTemplate<T, A, B, C>;

export const conditionalConstraintSolver = <T extends string>(route: T): ConstraintFn<T> => {
  return (input, _route) => {
    const [, domain, action, resource] = route.split('/') as [string, string, string, string];
    return {
      domain,
      action,
      resource,
      chain: enforceConstraint(input, input, input as unknown as Record<string, typeof input>),
      brand: input as BrandedConstraint<typeof input, 'ConstraintTemplate'>,
    } as never;
  };
};

export type SolverOverloadSignatures =
  | ((value: string, limit: 1) => string)
  | ((value: string, limit: 2) => number)
  | ((value: string, limit: 3) => boolean)
  | ((value: string, limit: 4) => null);

export function solveWithOverload(value: string, limit: 1): string;
export function solveWithOverload(value: string, limit: 2): number;
export function solveWithOverload(value: string, limit: 3): boolean;
export function solveWithOverload(value: string, limit: 4): null;
export function solveWithOverload(value: string, limit: 1 | 2 | 3 | 4): string | number | boolean | null {
  if (limit === 1) return value;
  if (limit === 2) return value.length;
  if (limit === 3) return value.includes('/');
  return null;
}

export const assertSolver = <T>(value: T): value is NoInfer<T> => value !== null && value !== undefined;

export type ConstraintNoInfer<T> = NoInfer<T>;
export type ConstraintOutput<T> = { readonly items: T[] };

export const applyNoInfer = <T, S extends ConstraintNoInfer<T>>(value: T, sample: S): ConstraintOutput<S> => ({
  items: [sample],
});

export const solveChain = <A extends ConstraintRecord, B extends A, C extends Record<string, A>>(
  value: string,
  a: A,
  b: B,
  c: C,
): Result<ConstraintTuple<A, B, C>, Error> => {
  const solved = value.startsWith('/') && Object.keys(a).length > 0 && Object.keys(c).length > 0 && Object.keys(b).length > 0;
  if (!solved) {
    return fail(new Error('unsolved'), 'CHAIN_FAIL');
  }
  return ok([ { label: 'A', active: true }, { label: 'B', active: true }, { label: 'C', active: true }, enforceConstraint(a, b, c)]);
};

export const constraintProfiles = <A extends ConstraintRecord, B extends A, C extends Record<string, A>>(
  chain: ConstraintChain<A, B, C>,
): ConstraintResolver<A, B, C> => {
  return [
    { label: 'A', active: true },
    { label: 'B', active: true },
    { label: 'C', active: true },
    chain,
  ] as unknown as ConstraintResolver<A, B, C>;
};
