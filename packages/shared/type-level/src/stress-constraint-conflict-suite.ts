type Brand<T, K extends string> = T & { readonly __brand: K };

export type NoInfer<T> = [T][T extends never ? 1 : 0];

export type Nominal<T, K extends string> = T & Brand<T & {}, K>;

export interface BrandGuard<T extends string> {
  readonly __brand: T;
}

export type BrandedId<T extends string> = `${string}-${T}` & BrandGuard<T>;

export interface SolverInputBase {
  readonly tenant: string;
  readonly namespace: string;
}

export type ConstraintA<T extends SolverInputBase = SolverInputBase> = {
  readonly input: T;
  readonly severity: 'tenant-prefixed' | 'tenant-raw';
};

export type ConstraintB<TBase extends SolverInputBase = SolverInputBase> = {
  readonly input: TBase;
  readonly envelope: Record<string, ConstraintA<TBase>>;
  readonly key: string;
  readonly value: ConstraintA<TBase>;
  readonly resolved: Record<string, unknown>;
};

export type ConstraintC<T extends string = string, TResolved extends Record<string, string> = Record<string, string>> = {
  readonly a: T;
  readonly b: T;
  readonly keys: keyof TResolved;
  readonly value: TResolved[keyof TResolved];
};

export type ConstraintResolved = {
  readonly tenant: string;
  readonly route: `/${string}`;
  readonly level: 1 | 2 | 3;
  readonly kind: 'resolved';
};

export type ConstraintUnion =
  | ConstraintA
  | ConstraintB
  | ConstraintC<string>
  | ConstraintResolved;

export type ConstraintDispatch<T> = T extends { readonly kind: 'resolved' } ? ConstraintResolved : T;

export type ConstraintDispatchValue = ConstraintDispatch<ConstraintUnion>;

export const resolveConstraintFromRecord = () => ({
  tenant: 'tenant.default',
  route: '/recovery/assess/default/ok',
  level: 1 as const,
  kind: 'resolved' as const,
});

export interface SolverFactory<K extends string, I = SolverInputBase, O = unknown, C extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: K;
  readonly input: I;
  readonly output: O;
  readonly config: { readonly confidence: number } & C;
}

export type SolverFactoryResult<
  K extends string = string,
  I = SolverInputBase,
  O = unknown,
  C extends Record<string, unknown> = Record<string, unknown>,
> = SolverFactory<K, I, O, { readonly confidence: number } & C>;

export const assertFactory = <
  K extends string,
  I,
  O,
  C extends Record<string, unknown>,
>(kind: K, input: I, output: O, config: C): SolverFactoryResult<K, I, O, C> => {
  return {
    kind,
    input,
    output,
    config: { confidence: 0.98, ...config } as { readonly confidence: number } & C,
  };
};

export interface SolverInvocation<
  A extends ConstraintA<SolverInputBase> = ConstraintA<SolverInputBase>,
  TInput extends SolverInputBase = SolverInputBase,
  TOutput = unknown,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  (input: TInput & { readonly tenant: A['input']['tenant'] }, output: TOutput, config: TConfig): SolverFactoryResult<'runtime', TInput, TOutput, TConfig>;
}

export interface ConstraintResolver<T extends string> {
  (input: SolverInputBase, context: { route: T; attempt: number }): Promise<
    ConstraintDispatch<ConstraintC<T>>
  >;
}

export type ResolverByKind<K extends string, T extends ConstraintUnion> = T extends { kind: K } ? T : never;

export function evaluateConstraint<T extends ConstraintUnion>(candidate: T): ConstraintDispatch<T>;
export function evaluateConstraint<T extends ConstraintUnion>(candidate: readonly T[]): ConstraintDispatch<T>[];
export function evaluateConstraint<T extends ConstraintUnion>(candidate: T | readonly T[]): ConstraintDispatch<T> | ConstraintDispatch<T>[] {
  if (Array.isArray(candidate)) {
    return candidate.map(() => resolveConstraintFromRecord()) as ConstraintDispatch<T>[];
  }
  return resolveConstraintFromRecord() as ConstraintDispatch<T>;
}

export const makeNominal = <T extends string>(value: T): BrandedId<T> => value as unknown as BrandedId<T>;

export type ConstraintChain<
  A extends SolverInputBase = SolverInputBase,
  B extends ConstraintA<A> = ConstraintA<A>,
  C extends Record<string, B> = Record<string, B>,
> = {
  readonly input: A;
  readonly envelope: C;
  readonly key: keyof C;
  readonly value: B;
  readonly resolved: Record<string, unknown>;
};

export const makeConstraintChain = <
  T extends string,
  C extends Record<string, ConstraintA<SolverInputBase>>,
>(params: {
  key: NoInfer<T>;
  payload: C;
}): ConstraintUnion => {
  const first = Object.values(params.payload)[0] as ConstraintA<SolverInputBase> | undefined;
  const input = first?.input ?? { tenant: '', namespace: '' };
  return {
    input,
    envelope: params.payload,
    key: params.key,
    value: first ?? { input, severity: 'tenant-raw' },
    resolved: {},
  } as ConstraintB;
};

export const constraintSolver = <
  A extends ConstraintA<SolverInputBase>,
  B extends Record<string, A>,
>(input: A, config: B, context: { token: BrandedId<string> }): ConstraintChain<SolverInputBase, A, B> => {
  const key = Object.keys(config)[0] as keyof B;
  return {
    input: input.input,
    envelope: config,
    key,
    value: config[key] as A,
    resolved: context,
  };
};

export const constraintGuard = <T>(value: T): value is T & SolverFactory<string, unknown, unknown> =>
  typeof value === 'object' && value !== null && 'kind' in (value as Record<string, unknown>) && 'input' in (value as Record<string, unknown>);

export const noInferResolver = <T>(value: NoInfer<T>): T => value as T;

export const buildConstraintResolver = <
  TKind extends string,
  TInput extends SolverInputBase,
  TOutput,
  TConfig extends Record<string, unknown>,
>(kind: TKind, input: TInput, output: TOutput, config: TConfig): SolverFactoryResult<TKind, TInput, TOutput, TConfig> => {
  return {
    kind,
    input,
    output,
    config: {
      ...config,
      token: makeNominal('graph' as const),
      confidence: 0.99,
    },
  };
};

export const buildConstraintGraph = <T extends ConstraintUnion>(entries: readonly T[]): SolverFactoryResult<
  string,
  T,
  ReadonlyArray<T>,
  { token: BrandedId<'graph'> }
> => {
  return {
    kind: 'runtime',
    input: entries[0] ?? ({} as T),
    output: entries as ReadonlyArray<T>,
    config: {
      token: makeNominal('graph'),
      confidence: 0.9,
    },
  };
};
