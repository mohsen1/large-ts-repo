import type { NoInfer } from './stress-instantiation-overload-hub';

export type SolverMode = 'strict' | 'adaptive' | 'forecast' | 'diagnostic';
export type SolverScope = 'tenant' | 'cluster' | 'service' | 'mesh';
export type SolverVerb = 'read' | 'write' | 'drain' | 'route' | 'eject' | 'repair' | 'admit' | 'sweep';

export type SolverInput<TMode extends SolverMode, TScope extends SolverScope> = {
  readonly mode: TMode;
  readonly scope: TScope;
  readonly payload: string;
  readonly tags: readonly string[];
};

export type SolverResult<TMode extends SolverMode, TScope extends SolverScope, TVerb extends SolverVerb> = {
  readonly mode: TMode;
  readonly scope: TScope;
  readonly verb: TVerb;
  readonly confidence: number;
  readonly trace: readonly string[];
};

type BuildConstraint<TMode extends SolverMode, TScope extends SolverScope> = {
  readonly constraint: `${TMode}-${TScope}`;
  readonly dynamic: boolean;
};

export type SolverConstraint<TMode extends SolverMode, TScope extends SolverScope> = BuildConstraint<TMode, TScope>;

export type SolverFactory<TMode extends SolverMode, TScope extends SolverScope> = <
  TInput extends SolverInput<TMode, TScope>,
  TConstraint extends string,
  TVerb extends SolverVerb = SolverVerb,
>(
  input: TInput,
  verb: TVerb,
  constraint: NoInfer<TConstraint>,
) => SolverResult<TMode, TScope, TVerb> & {
  readonly constraint: SolverConstraint<TMode, TScope> & { readonly token: TConstraint };
};

export type SolverPipeline<TMode extends SolverMode, TScope extends SolverScope, TResult> = {
  readonly mode: TMode;
  readonly scope: TScope;
  readonly execute: (input: SolverInput<TMode, TScope>) => Promise<TResult>;
  readonly trace: readonly string[];
};

export interface SolverAssertion<T extends string> {
  readonly tag: T;
  assert(input: unknown): input is T;
}

type SolverRuntimeResult<TMode extends SolverMode, TScope extends SolverScope, TConstraint extends string, TVerb extends SolverVerb> = {
  readonly mode: TMode;
  readonly scope: TScope;
  readonly verb: TVerb;
  readonly confidence: number;
  readonly trace: readonly string[];
  readonly constraint: { readonly constraint: `${TMode}-${TScope}`; readonly dynamic: boolean; readonly token: TConstraint };
};

export const buildSolverFactory = <TMode extends SolverMode, TScope extends SolverScope>(): SolverFactory<TMode, TScope> => {
  return ((input, verb, constraint) => {
    return {
      mode: input.mode,
      scope: input.scope,
      verb,
      confidence: Math.min(0.98, (input.payload.length + constraint.length) / 120),
      trace: [input.mode, input.scope, verb, constraint],
      constraint: {
      constraint: `${input.mode}-${input.scope}`,
      dynamic: input.mode === 'adaptive',
        token: constraint,
      },
    } as unknown as SolverRuntimeResult<TMode, TScope, typeof constraint, typeof verb>;
  }) as SolverFactory<TMode, TScope>;
};

export const makeSolverPipeline = <
  TMode extends SolverMode,
  TScope extends SolverScope,
  TResult,
>(
  factory: SolverFactory<TMode, TScope>,
  verb: SolverVerb,
  _baseline: TResult,
): SolverPipeline<TMode, TScope, TResult> => {
  return {
    mode: 'strict' as TMode,
    scope: 'tenant' as TScope,
    trace: ['pipeline:start'],
    execute: async (input) => {
      const runtime = factory(input, verb, `${verb}:${input.mode}`) as unknown as TResult;
      return runtime;
    },
  };
};

export const bindSolverMode = <TMode extends SolverMode, TScope extends SolverScope>(
  input: SolverInput<TMode, TScope>,
  mode: TMode,
  scope?: TScope,
): SolverInput<TMode, TScope> => {
  return { ...input, mode, ...(scope !== undefined ? { scope } : {}) } as SolverInput<TMode, TScope>;
};

export const createSolverInvocationMatrix = <
  const Modes extends readonly SolverMode[],
  const Scopes extends readonly SolverScope[],
  const Verbs extends readonly SolverVerb[],
>(modes: Modes, scopes: Scopes, verbs: Verbs) => {
  const factory = buildSolverFactory<SolverMode, SolverScope>();
  const invocations: Array<{
    mode: SolverMode;
    scope: SolverScope;
    verb: SolverVerb;
    result: SolverResult<SolverMode, SolverScope, SolverVerb>;
  }> = [];

  for (const mode of modes) {
    for (const scope of scopes) {
      for (const verb of verbs) {
        const input = {
          mode,
          scope,
          payload: `${mode}:${scope}:${verb}`,
          tags: ['stress', verb],
        } as SolverInput<SolverMode, SolverScope>;
        const raw = factory(input, verb, `${mode}:${scope}:${verb}`) as unknown as SolverResult<SolverMode, SolverScope, SolverVerb>;
        invocations.push({
          mode,
          scope,
          verb,
          result: raw,
        });
      }
    }
  }

  return {
    invocations,
    total: invocations.length,
    byMode: invocations.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.mode] = (acc[entry.mode] ?? 0) + 1;
      return acc;
    }, {}),
  } satisfies {
    invocations: readonly {
      mode: SolverMode;
      scope: SolverScope;
      verb: SolverVerb;
      result: SolverResult<SolverMode, SolverScope, SolverVerb>;
    }[];
    total: number;
    byMode: Readonly<Record<string, number>>;
  };
};

export const solverHub = createSolverInvocationMatrix(
  ['strict', 'adaptive', 'forecast', 'diagnostic'],
  ['tenant', 'cluster', 'service', 'mesh'],
  ['read', 'write', 'drain', 'route', 'eject'],
);

export const solverMatrixSummary = (matrix: ReturnType<typeof createSolverInvocationMatrix>): {
  readonly total: number;
  readonly uniqueModes: readonly SolverMode[];
  readonly uniqueScopes: readonly SolverScope[];
  readonly sample?: SolverResult<SolverMode, SolverScope, SolverVerb>;
} => {
  const total = matrix.total;
  const uniqueModes = [...new Set(matrix.invocations.map((entry) => entry.mode))] as SolverMode[];
  const uniqueScopes = [...new Set(matrix.invocations.map((entry) => entry.scope))] as SolverScope[];
  const sample = matrix.invocations[0]?.result ?? null;
  return {
    total,
    uniqueModes: Object.freeze(uniqueModes),
    uniqueScopes: Object.freeze(uniqueScopes),
    sample,
  };
};

export const SolverBrand = Symbol('SolverBrand');

export interface BrandedSolverResult {
  readonly [SolverBrand]: true;
  readonly kind: 'branded';
  readonly result: SolverResult<SolverMode, SolverScope, SolverVerb>;
}

export const withBrand = <T extends SolverResult<SolverMode, SolverScope, SolverVerb>>(result: T): BrandedSolverResult => ({
  [SolverBrand]: true as const,
  kind: 'branded',
  result,
});

export const isBrandedResult = (value: unknown): value is BrandedSolverResult =>
  typeof value === 'object' && value !== null && (value as BrandedSolverResult)[SolverBrand] === true;

export const makeHigherOrderSolver = <TConstraint extends string>(constraint: TConstraint) => {
  const base = buildSolverFactory<'strict', 'tenant'>();
  const verify = (value: unknown): value is SolverResult<SolverMode, SolverScope, SolverVerb> => {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const typed = value as SolverResult<SolverMode, SolverScope, SolverVerb>;
    return typeof typed.confidence === 'number' && typed.trace.length > 0;
  };

  return <TMode extends SolverMode, TScope extends SolverScope>(
    input: SolverInput<TMode, TScope>,
    verb: SolverVerb,
    transform: (
      result: SolverResult<TMode, TScope, SolverVerb>,
    meta: { token: TConstraint },
    input: SolverInput<TMode, TScope>,
    verb: SolverVerb,
    trace: readonly string[],
  ) => SolverResult<TMode, TScope, SolverVerb>,
  ): SolverResult<TMode, TScope, SolverVerb> => {
    const raw = base(
      bindSolverMode(input as SolverInput<'strict', 'tenant'>, input.mode as 'strict', input.scope as 'tenant'),
      verb,
      constraint,
    ) as unknown as SolverRuntimeResult<'strict', 'tenant', TConstraint, SolverVerb>;
    const output = transform(
      raw as unknown as SolverResult<TMode, TScope, SolverVerb>,
      { token: constraint },
      input,
      verb,
      raw.trace as readonly string[],
    );
    if (!verify(output)) {
      throw new Error(`solver failed ${verb}`);
    }
    return output;
  };
};

export const runSolverMatrix = (modes: readonly SolverMode[], scopes: readonly SolverScope[], verbs: readonly SolverVerb[]) =>
  createSolverInvocationMatrix(modes, scopes, verbs).invocations;
