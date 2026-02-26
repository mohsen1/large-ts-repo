import type { Brand, NoInfer } from './patterns';

export type SolverMode = 'strict' | 'diagnostic' | 'simulate' | 'shadow' | 'sweep';
export type SolverVerb = 'analyze' | 'resolve' | 'synthesize' | 'verify' | 'simulate' | 'observe';

export type SolverPayload<TMode extends SolverMode> = TMode extends 'strict'
  ? { readonly strict: true; readonly level: number }
  : TMode extends 'diagnostic'
    ? { readonly diagnostic: true; readonly diagnostics: readonly string[] }
    : TMode extends 'simulate'
      ? { readonly simulate: true; readonly forecast: number }
      : TMode extends 'shadow'
        ? { readonly shadow: true; readonly confidence: number }
        : { readonly sweep: true; readonly variants: number };

export type SolverContract<TVerb extends SolverVerb, TMode extends SolverMode> = {
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly payload: SolverPayload<TMode>;
};

type SolverSignature<T extends string> = `solver:${T}`;
type SolverScope<T> = T extends `solver:${infer Scope}` ? Scope : 'default';
export type SolverBrand<T extends string> = Brand<T, 'solver-token'>;

export interface SolverConstraint<
  TDomain extends string,
  TMode extends SolverMode,
  TVerbs extends readonly SolverVerb[],
> {
  readonly domain: SolverBrand<TDomain>;
  readonly mode: TMode;
  readonly verbs: TVerbs;
  readonly scope: SolverScope<SolverSignature<TDomain>>;
}

export type SolverInput<
  TDomain extends string,
  TMode extends SolverMode,
  TVerbs extends readonly SolverVerb[],
> = {
  readonly domain: TDomain;
  readonly tenant: string;
  readonly contract: SolverContract<TVerbs[number], TMode>;
  readonly constraints: SolverConstraint<TDomain, TMode, TVerbs>;
};

export type SolverResult<TInput> = {
  readonly resolved: true;
  readonly input: TInput;
  readonly value: number;
  readonly signature: string;
  readonly createdAt: number;
};

export const createSolverContext = <TDomain extends string>(domain: TDomain) => ({
  domain,
  createdAt: Date.now(),
  signature: `solver:${domain}` as SolverSignature<TDomain>,
});

export function solve<TDomain extends string, TMode extends SolverMode, TVerbs extends readonly SolverVerb[]>(
  contract: SolverContract<SolverVerb, TMode>,
  input: SolverInput<TDomain, TMode, TVerbs>,
): SolverResult<SolverInput<TDomain, TMode, TVerbs>>;
export function solve<TMode extends SolverMode, TDomain extends string, TVerbs extends readonly SolverVerb[]>(
  contract: { readonly verb: TVerbs[number]; readonly mode: TMode; readonly payload: SolverPayload<TMode> },
  input: SolverInput<TDomain, TMode, TVerbs>,
): SolverResult<SolverInput<TDomain, TMode, TVerbs>>;
export function solve<TMode extends SolverMode, TDomain extends string, TVerbs extends readonly SolverVerb[], TPayload extends SolverPayload<TMode>>(
  contract: { readonly verb: SolverVerb; readonly mode: TMode; readonly payload: TPayload },
  input: SolverInput<TDomain, TMode, TVerbs>,
): SolverResult<SolverInput<TDomain, TMode, TVerbs>> {
  const contractPayload = input.contract.payload as Record<string, unknown>;
  const score = Object.values(contractPayload).length * 100;
  return {
    resolved: true,
    input,
    value: score + input.constraints.verbs.length,
    signature: `${contract.verb}:${input.domain}:${input.contract.verb}`,
    createdAt: Date.now(),
  };
}

export function buildSolverCatalog<const TVerbs extends readonly SolverVerb[], TMode extends SolverMode>(
  domain: string,
  mode: TMode,
  verbs: TVerbs,
  payload: SolverPayload<TMode>,
): readonly SolverResult<SolverInput<string, TMode, TVerbs>>[] {
  return verbs.map((verb) =>
    solve(
      { verb, mode, payload },
      {
        domain,
        tenant: `${domain}-tenant`,
        contract: { verb, mode, payload },
        constraints: {
          domain: `${domain}-domain` as SolverBrand<string>,
          mode,
          verbs,
          scope: 'default',
        },
      },
    ),
  );
}

export type SolverRunRecord = ReturnType<typeof buildSolverCatalog>[number];

export type SolverMatrixInput<T extends SolverResult<unknown>> = T extends { signature: infer S; value: infer V }
  ? S extends string
    ? { readonly signature: S; readonly value: V; readonly route: `/solver/${S}` }
    : never
  : never;

export type SolverRunMatrix = ReadonlyArray<SolverMatrixInput<SolverRunRecord>>;

export const runSolverFabric = (): SolverRunMatrix => {
  const strict = buildSolverCatalog('recovery', 'strict', ['analyze', 'resolve', 'verify'], {
    strict: true,
    level: 3,
  });
  const simulate = buildSolverCatalog('control', 'simulate', ['synthesize', 'observe'], {
    simulate: true,
    forecast: 12,
  });
  const sweep = buildSolverCatalog('network', 'sweep', ['analyze', 'observe', 'simulate'], {
    sweep: true,
    variants: 4,
  });
  const rows = [...strict, ...simulate, ...sweep] as readonly SolverRunRecord[];
  return rows.map((entry) => ({
    signature: entry.signature,
    value: entry.value,
    route: `/solver/${entry.signature}`,
  })) as unknown as SolverRunMatrix;
};

export const profileSolverMatrix = <T extends readonly SolverRunRecord[]>(rows: T): readonly SolverMatrixInput<T[number]>[] =>
  rows.flatMap((entry) => [
    {
      signature: entry.signature,
      value: entry.value,
      route: `/solver/${entry.signature}`,
    } as SolverMatrixInput<T[number]>,
  ]);

export type SolverFactoryInput<
  TDomain extends string,
  TVerbs extends readonly SolverVerb[],
  TMode extends SolverMode,
> = SolverInput<TDomain, TMode, TVerbs>;

export const liftSolver = <TDomain extends string, TMode extends SolverMode, TVerbs extends readonly SolverVerb[]>(
  context: SolverFactoryInput<TDomain, TVerbs, TMode>,
) => {
  return <TValue>(value: TValue) =>
    Object.assign(solve(context.contract, context), {
      lifted: value,
      context,
    }) as SolverResult<SolverFactoryInput<TDomain, TVerbs, TMode>> & {
      readonly lifted: TValue;
      readonly context: SolverFactoryInput<TDomain, TVerbs, TMode>;
    };
};

export type SolverBenchmarkEntry<T extends SolverMode, TDomain extends string> = {
  readonly domain: TDomain;
  readonly mode: T;
  readonly input: SolverInput<TDomain, T, [SolverVerb]>;
  readonly output: SolverResult<SolverInput<TDomain, T, [SolverVerb]>>;
};

export const runSolverBenchmark = (): readonly SolverBenchmarkEntry<SolverMode, string>[] => {
  const context = createSolverContext('control');
  return (['analyze', 'resolve', 'synthesize'] as const).map((verb) => {
    const input: SolverInput<'control', 'strict', [SolverVerb]> = {
      domain: context.domain,
      tenant: `${verb}-tenant`,
      contract: {
        verb,
        mode: 'strict',
        payload: {
          strict: true,
          level: 2,
        },
      },
      constraints: {
        domain: `${context.domain}-domain` as SolverBrand<'control'>,
        mode: 'strict',
        verbs: [verb],
        scope: 'control',
      },
    };
    return {
      domain: context.domain,
      mode: 'strict',
      input,
      output: solve(input.contract, input),
    };
  }) as SolverBenchmarkEntry<SolverMode, string>[];
};
