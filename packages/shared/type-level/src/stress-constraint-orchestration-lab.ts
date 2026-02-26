export type NoInfer<T> = [T][T extends any ? 0 : never];

export interface SolverContext<Tag extends string = 'solver'> {
  readonly tag: Tag;
  readonly issuedAt: number;
  readonly owner: string;
}

export interface SolverInput<Tag extends string = string, Value = unknown> {
  readonly name: string & { readonly __tag: Tag };
  readonly values: readonly Value[];
  readonly context: SolverContext<Tag>;
}

export interface SolverOutput<Tag extends string = string, Value = unknown> {
  readonly token: Brand<string, Tag>;
  readonly values: readonly Value[];
  readonly accepted: boolean;
  readonly attempts: number;
}

export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };

export type Brandify<T extends string, Tag extends string> = T & { readonly __brand: Tag };

export type ConstraintMatrix<
  A extends string,
  B extends string,
  C extends Record<A, unknown> & Record<B, unknown>,
> = {
  readonly a: A;
  readonly b: B;
  readonly constraints: {
    readonly [K in keyof C]: K extends A
      ? C[K] & { readonly __source: 'a' }
      : K extends B
        ? C[K] & { readonly __source: 'b' }
        : C[K];
  };
};

export type StageGraph<
  A extends string,
  B extends string,
  C extends Record<string, unknown>,
> = C & {
  readonly stageA: Brand<A, 'a-stage'>;
  readonly stageB: Brand<B, 'b-stage'>;
};

export type ConstraintTuple<A extends string, B extends string, C extends Record<string, unknown>> =
  | {
      readonly lhs: A;
      readonly rhs: B;
      readonly matrix: ConstraintMatrix<A, B, C>;
    }
  | {
      readonly lhs: B;
      readonly rhs: A;
      readonly matrix: ConstraintMatrix<B, A, C>;
    };

export type ConstraintChain<
  A extends string,
  B extends string,
  C extends string,
  N extends 0 | 1 | 2 | 3 | 4,
> = N extends 0
  ? StageGraph<A, B, { [K in A | B | C]: unknown }>
  : ConstraintChain<A, B, C, DecrementDepth[N]>;

export type DecrementDepth = [0, 0, 1, 2, 3, 4];

export type MergeSolver<A, B, C> = A & B & C;

export type ConstraintPath<T> = T extends readonly [infer First, ...infer Rest]
  ? First extends string
    ? Rest extends readonly string[]
      ? `${First}->${ConstraintPath<Rest>}`
      : First
    : never
  : never;

export type ConstraintSet =
  | ConstraintTuple<'policy', 'plan', { policy: 'secure'; plan: 'fast' }>
  | ConstraintTuple<'timeline', 'snapshot', { timeline: 'realtime'; snapshot: 'point' }>
  | ConstraintTuple<'route', 'signal', { route: 'active'; signal: 'raised' }>
  | ConstraintTuple<'mesh', 'node', { mesh: 'grid'; node: 'leaf' }>
  | ConstraintTuple<'ops', 'control', { ops: 'live'; control: 'auto' }>;

export type ConstraintInference<T> = T extends ConstraintTuple<infer A, infer B, infer C>
  ? MergeSolver<
      { readonly sourceA: A; readonly sourceB: B },
      { readonly payload: ConstraintPath<[A & string, B & string]> },
      C
    >
  : never;

export type SolverOverloadResult<T extends SolverInput, A extends SolverOutput, B extends SolverOutput> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly value: B };

export function assertSolver<TInput extends SolverInput>(
  input: TInput,
): input is TInput & { readonly values: readonly [string, ...string[]] } {
  return input.values.length > 0;
}

export function adaptSolver<TInput extends SolverInput>(input: TInput): SolverInput<TInput['name'], TInput['values'][number]>;
export function adaptSolver<TInput extends SolverInput, TName extends string, TValues>(
  input: TInput,
  name: TName,
  values: TValues,
): SolverInput<TName, TValues>;
export function adaptSolver<TInput extends SolverInput, TName extends string, TValues>(
  input: TInput,
  name?: TName,
  values?: TValues,
): SolverInput<string, unknown> {
  if (name === undefined || values === undefined) {
    return input as SolverInput<string, unknown>;
  }
  return {
    ...input,
    name,
    values: [values] as readonly [TValues],
  } as SolverInput<string, unknown>;
}

export function solve<T extends SolverInput>(input: T, overrides?: NoInfer<T>): SolverOutput<Extract<T['name'], string>, T['values'][number]>;
export function solve<T extends SolverInput, U extends SolverContext>(
  input: T,
  context: U,
): SolverOutput<U['tag'], T['values'][number]>;
export function solve<T extends SolverInput, U extends SolverContext>(
  input: T,
  overrides?: NoInfer<T> | U,
): SolverOutput<string, T['values'][number]> {
  if (typeof overrides === 'object' && overrides && 'tag' in overrides) {
    return {
      token: String(input.name) as Brand<string, string>,
      values: input.values,
      accepted: input.values.length > 0,
      attempts: input.values.length,
    };
  }

  return {
    token: String(input.name) as Brand<string, string>,
    values: input.values,
    accepted: input.values.length > 0,
    attempts: input.values.length,
  };
}

export const solverTrace = <T extends string>(
  constraints: readonly ConstraintSet[],
  seed: T,
): ReadonlyArray<ConstraintSet & { readonly path: ConstraintPath<['seed', T]> } > => {
  const normalized = constraints
    .map((entry) => ({ ...entry, path: `seed->${seed}` as ConstraintPath<['seed', T]> }))
    .filter((entry): entry is ConstraintSet & { readonly path: ConstraintPath<['seed', T]> } => true);
  return normalized;
};

export const satisfiesSolver = <T extends SolverInput>(input: T) =>
  ({
    ...input,
    accepted: input.values.length > 0,
    context: {
      ...input.context,
      tag: `${input.context.tag}-solved`,
    },
  }) as unknown as SolverOutput<T['name'] extends string ? T['name'] : string, T['values'][number]>;

export type SolverOutputAssert = {
  readonly token: Brand<string, string>;
  readonly values: readonly unknown[];
  readonly accepted: boolean;
  readonly attempts: number;
};

export type NominalScope<T, Tag extends string> = T & {
  readonly __scope: symbol;
  readonly __tag: Tag;
};

export type BrandedEvent<Name extends string> = NominalScope<Name, 'event'>;

export const emitNominalEvent = <Name extends string>(name: Name): BrandedEvent<Name> =>
  ({
    __scope: Symbol('scope'),
    __tag: 'event',
    [name]: name,
  }) as unknown as BrandedEvent<Name>;

export const isNominalEvent = <Name extends string>(value: unknown): value is BrandedEvent<Name> =>
  typeof value === 'object' && value !== null;

export const constraintSuite = [
  { lhs: 'policy', rhs: 'plan', matrix: { a: 'policy', b: 'plan', constraints: { policy: 'secure', plan: 'fast' } } as ConstraintMatrix<'policy', 'plan', { policy: 'secure'; plan: 'fast' }>, },
  { lhs: 'timeline', rhs: 'snapshot', matrix: { a: 'timeline', b: 'snapshot', constraints: { timeline: 'realtime', snapshot: 'point' } } as ConstraintMatrix<'timeline', 'snapshot', { timeline: 'realtime'; snapshot: 'point' }>, },
  { lhs: 'route', rhs: 'signal', matrix: { a: 'route', b: 'signal', constraints: { route: 'active', signal: 'raised' } } as ConstraintMatrix<'route', 'signal', { route: 'active'; signal: 'raised' }>, },
  { lhs: 'mesh', rhs: 'node', matrix: { a: 'mesh', b: 'node', constraints: { mesh: 'grid', node: 'leaf' } } as ConstraintMatrix<'mesh', 'node', { mesh: 'grid'; node: 'leaf' }>, },
  { lhs: 'ops', rhs: 'control', matrix: { a: 'ops', b: 'control', constraints: { ops: 'live', control: 'auto' } } as ConstraintMatrix<'ops', 'control', { ops: 'live'; control: 'auto' }>, },
] as const;
