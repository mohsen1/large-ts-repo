export type Brand<T, B extends string> = T & { readonly __brand: B };
export type BrandedId<T extends string> = Brand<T, 'BrandedId'>;
export type BrandedTag<T extends string> = Brand<T, 'BrandedTag'>;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type SolverMode = 'analyze' | 'plan' | 'execute' | 'audit' | 'verify';
export type SolverVerb = 'open' | 'close' | 'retry' | 'cancel' | 'hold' | 'release';

export interface SolverConstraint<
  TScope extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TVerb extends SolverVerb = SolverVerb,
> {
  readonly scope: BrandedTag<TScope>;
  readonly verb: TVerb;
  readonly payload: TPayload;
}

export type SolverSignature<T extends SolverConstraint> = {
  readonly scope: T['scope'];
  readonly verb: T['verb'];
  readonly key: `${T['scope']}:${T['verb']}`;
  readonly keys: Array<keyof T['payload']>;
};

export interface SolverAdapter<TConstraint extends SolverConstraint, TOutput, TError extends Error = never> {
  readonly constraint: TConstraint;
  readonly execute: (input: TConstraint['payload']) => Promise<TOutput | TError>;
  readonly signature: SolverSignature<TConstraint>;
}

export interface SolverRegistry<TConstraint extends SolverConstraint, TResult, TError extends Error = never> {
  readonly entries: Array<SolverAdapter<TConstraint, TResult, TError>>;
  readonly mode: SolverMode;
  register<TEntry extends SolverAdapter<TConstraint, TResult, TError>>(entry: TEntry): TEntry;
}

export interface SolverFactory<TScope extends string, TDefaultError extends Error = Error> {
  createAnalyzer<
    TPayload extends Record<string, unknown>,
    TVerb extends SolverVerb,
    TOutput,
  >(
    signature: SolverSignature<SolverConstraint<TScope, TPayload, TVerb>>,
    execute: (input: TPayload) => Promise<TOutput>,
    mode?: Exclude<SolverMode, 'execute'>,
  ): SolverAdapter<SolverConstraint<TScope, TPayload, TVerb>, TOutput, TDefaultError>;

  createRunner<
    TPayload extends Record<string, unknown>,
    TOutput,
    TScope extends string,
  >(
    scope: BrandedTag<TScope>,
    execute: (input: TPayload) => Promise<TOutput>,
  ): SolverAdapter<SolverConstraint<TScope, TPayload, 'open'>, TOutput, TDefaultError>;
}

export const createBrandedId = <T extends string>(value: T): BrandedId<T> => value as BrandedId<T>;
export const createBrandedTag = <T extends string>(value: T): BrandedTag<T> => value as BrandedTag<T>;

export const defineConstraint = <
  TScope extends string,
  TPayload extends Record<string, unknown>,
  TVerb extends SolverVerb,
>(
  scope: TScope,
  verb: TVerb,
  payload: TPayload,
): SolverConstraint<TScope, TPayload, TVerb> => ({
  scope: createBrandedTag(scope),
  verb,
  payload,
});

export const makeSolver = <
  TConstraint extends SolverConstraint,
  TResult,
  TError extends Error = never,
>(
  signature: SolverSignature<TConstraint>,
  handler: (input: TConstraint['payload']) => Promise<TResult>,
  mode: SolverMode = 'analyze',
): SolverAdapter<TConstraint, TResult, TError> => {
  void mode;
  return {
    constraint: {
      scope: signature.scope,
      verb: signature.verb,
      payload: {} as TConstraint['payload'],
    } as TConstraint,
    execute: handler as (input: TConstraint['payload']) => Promise<TResult | TError>,
    signature,
  };
};

export const createSolverRegistry = <
  TConstraint extends SolverConstraint,
  TResult,
  TError extends Error = never,
>(): SolverRegistry<TConstraint, TResult, TError> => {
  const entries: Array<SolverAdapter<TConstraint, TResult, TError>> = [];
  return {
    entries,
    mode: 'analyze',
    register(entry) {
      entries.push(entry);
      return entry;
    },
  };
};

export const registerMany = <
  TConstraint extends SolverConstraint,
  TResult,
  TError extends Error = never,
>(
  registry: SolverRegistry<TConstraint, TResult, TError>,
  entries: readonly SolverAdapter<TConstraint, TResult, TError>[],
): SolverRegistry<TConstraint, TResult, TError> => {
  for (const entry of entries) {
    registry.register(entry);
  }
  return registry;
};

export const instantiateSolverFactory = (): SolverFactory<'global'> => {
  const asConstraint = <TPayload extends Record<string, unknown>, TVerb extends SolverVerb>(
    signature: SolverSignature<SolverConstraint<'global', TPayload, TVerb>>,
  ): SolverSignature<SolverConstraint<'global', TPayload, TVerb>> => signature;

  return {
    createAnalyzer<TPayload extends Record<string, unknown>, TVerb extends SolverVerb, TOutput>(
      signature: SolverSignature<SolverConstraint<'global', TPayload, TVerb>>,
      execute: (input: TPayload) => Promise<TOutput>,
      _mode?: Exclude<SolverMode, 'execute'>,
    ): SolverAdapter<SolverConstraint<'global', TPayload, TVerb>, TOutput> {
      return makeSolver<SolverConstraint<'global', TPayload, TVerb>, TOutput>(
        asConstraint(signature),
        execute as (input: TPayload) => Promise<TOutput>,
      );
    },
    createRunner<TPayload extends Record<string, unknown>, TOutput, TScope extends string>(
      scope: BrandedTag<TScope>,
      execute: (input: TPayload) => Promise<TOutput>,
    ): SolverAdapter<SolverConstraint<TScope, TPayload, 'open'>, TOutput> {
      const signature: SolverSignature<SolverConstraint<TScope, TPayload, 'open'>> = {
        scope,
        verb: 'open',
        key: `${scope}:open`,
        keys: [],
      };

      return {
        constraint: {
          scope,
          verb: 'open',
          payload: {} as TPayload,
        },
        execute: execute as (input: TPayload) => Promise<TOutput>,
        signature,
      };
    },
  };
};

export type ConstraintUnion =
  | SolverConstraint<'recovery', { reason: string }, 'open'>
  | SolverConstraint<'incident', { id: string; score: number }, 'close'>
  | SolverConstraint<'fabric', { target: string; policy: boolean }, 'retry'>
  | SolverConstraint<'mesh', { node: string; weight: number }, 'hold'>
  | SolverConstraint<'policy', { dryRun: boolean }, 'release'>;

export type SolverSelection<T extends SolverConstraint> = T extends SolverConstraint<infer S, infer P, infer V>
  ? {
      readonly scope: S;
      readonly payload: P;
      readonly verb: V;
    }
  : never;

export const buildConstraintSet = (): ConstraintUnion[] => [
  defineConstraint('recovery', 'open', { reason: 'startup' }),
  defineConstraint('incident', 'close', { id: 'i-1', score: 2 }),
  defineConstraint('fabric', 'retry', { target: 'core', policy: true }),
  defineConstraint('mesh', 'hold', { node: 'mesh-1', weight: 5 }),
  defineConstraint('policy', 'release', { dryRun: true }),
];

export const satisfiesSolver = <T extends SolverConstraint>(constraint: T): SolverSignature<T> => ({
  scope: constraint.scope,
  verb: constraint.verb,
  key: `${constraint.scope}:${constraint.verb}`,
  keys: Object.keys(constraint.payload) as Array<keyof T['payload']>,
});

export const materializeSolverMatrix = (constraints: readonly ConstraintUnion[]): SolverAdapter<
  ConstraintUnion,
  SolverSelection<ConstraintUnion>
>[] =>
  constraints.map((constraint) => ({
    constraint,
    execute: async (input) =>
      ({
        scope: constraint.scope,
        payload: input,
        verb: constraint.verb,
      }) as SolverSelection<ConstraintUnion>,
    signature: satisfiesSolver(constraint),
  }));

export const solveMatrix = async <
  T extends SolverConstraint,
  TError extends Error = never,
>(
  inputs: readonly SolverAdapter<T, SolverSelection<T>, TError>[],
): Promise<Array<Awaited<SolverSelection<T> | TError>>> => {
  const out: Array<Awaited<SolverSelection<T> | TError>> = [];
  for (const entry of inputs) {
    const payload = entry.constraint.payload as T['payload'];
    const next = (await entry.execute(payload)) as Awaited<SolverSelection<T> | TError>;
    out.push(next);
  }
  return out;
};

export function makeConstrainedAdapter<
  TScope extends string,
  TPayload extends Record<string, unknown>,
  TVerb extends SolverVerb,
  TResult,
>(
  scope: BrandedId<TScope>,
  verb: TVerb,
  payload: NoInfer<TPayload>,
  output: TResult,
): SolverAdapter<SolverConstraint<TScope, TPayload, TVerb>, TResult> {
  const resolvedScope = createBrandedTag(scope) as BrandedTag<TScope>;
  return {
    constraint: {
      scope: resolvedScope,
      verb,
      payload,
    },
    execute: async () => output,
    signature: {
      scope: resolvedScope,
      verb,
      key: `${resolvedScope}:${verb}`,
      keys: Object.keys(payload) as Array<keyof TPayload>,
    },
  };
}

export const buildSolverConstraintSet = <T extends readonly SolverConstraint[]>(
  constraints: T,
): {
  readonly entries: T;
  readonly signatures: { [K in keyof T]: SolverSignature<T[K]> };
} => ({
  entries: constraints,
  signatures: constraints.map((entry) => satisfiesSolver(entry)) as { [K in keyof T]: SolverSignature<T[K]> },
});

export type SolverConstraintSet<T extends readonly SolverConstraint[]> = {
  readonly entries: T;
  readonly signatures: { [K in keyof T]: SolverSignature<T[K]> };
};

export const makeOverload = <T extends ConstraintUnion>(mode: SolverMode) => [
  (constraint: T, adapter: SolverAdapter<T, SolverSelection<T>>) => ({
    mode,
    constraint,
    adapter,
  }),
  (payload: T['payload']) => ({ mode, payload }),
  (...count: readonly [number, ...T[]]) => `${mode}:${count.length}`,
] as const;

export const buildSolverChain = (constraints: readonly ConstraintUnion[]): SolverAdapter<
  ConstraintUnion,
  SolverSelection<ConstraintUnion>
>[] => {
  const out: Array<SolverAdapter<ConstraintUnion, SolverSelection<ConstraintUnion>>> = [];
  const registry = createSolverRegistry<ConstraintUnion, SolverSelection<ConstraintUnion>>();
  for (const constraint of constraints) {
    const adapter: SolverAdapter<ConstraintUnion, SolverSelection<ConstraintUnion>> = {
      constraint,
      signature: satisfiesSolver(constraint),
      execute: async (input) => ({
        scope: constraint.scope,
        payload: input,
        verb: constraint.verb,
      }) as SolverSelection<ConstraintUnion>,
    };
    registry.register(adapter);
    out.push(adapter);
  }
  return out;
};

export const solveChain = async (constraints: readonly ConstraintUnion[]): Promise<
  Array<Awaited<SolverSelection<ConstraintUnion>>>
> => {
  const adapters = buildSolverChain(constraints);
  return solveMatrix(adapters);
};
