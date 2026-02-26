import type { Brand, NoInfer, PathValue } from './patterns';
import type { NoInferAdvanced } from './composition-labs';

export type SolverInput<TContext extends string, TMode extends `mode-${string}`> = {
  readonly tenant: Brand<string, `tenant:${TContext}`>;
  readonly requestId: Brand<string, `request:${TContext}`>;
  readonly mode: TMode;
  readonly stamps: readonly number[];
};

export interface SolverEnvelope<
  TDomain,
  TMode extends `mode-${string}`,
  TPayload,
> {
  readonly domain: TDomain;
  readonly payload: TPayload;
  readonly mode: TMode;
  readonly timestamp: number;
}

export interface SolverContract<TInput, TOutput, TResult> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly run: (value: TInput) => Promise<TResult>;
}

export type ConflictState<TInput, TOutput> = {
  readonly input: TInput;
  readonly output: TOutput;
};

export type ConstraintLayer<T extends readonly string[]> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends `${infer Name}:${infer Version}`
    ? {
        readonly name: Name;
        readonly version: Version;
        readonly tail: ConstraintLayer<Rest extends readonly string[] ? Rest : []>;
      }
    : ConstraintLayer<Rest extends readonly string[] ? Rest : []>
  : [];

export type PathConstraint<TPaths extends string> = TPaths extends `${infer Head}/${infer Rest}`
  ? { readonly head: Head; readonly tail: PathConstraint<Rest> }
  : { readonly head: TPaths; readonly tail: never };

export type ConflictResolution<
  TInput,
  TLayer extends readonly string[],
  TMarker extends Brand<string, 'marker'>,
> = {
  readonly input: TInput;
  readonly layers: TLayer;
  readonly marker: TMarker;
  readonly score: ResolveScore<TInput, TLayer>;
  readonly resolved: true;
};

type ResolveScore<TInput, TLayer extends readonly string[], Acc extends unknown[] = []> =
  TLayer extends readonly [infer Head, ...infer Rest]
    ? Head extends string
      ? TInput extends Record<string, never>
        ? ResolveScore<TInput, Rest extends readonly string[] ? Rest : [], Acc>
        : ResolveScore<TInput, Rest extends readonly string[] ? Rest : [], [...Acc, unknown]>
      : ResolveScore<TInput, Rest extends readonly string[] ? Rest : [], Acc>
    : Acc['length'];

export type SolverConstraints<
  TA extends Record<string, unknown>,
  TB extends keyof TA,
  TC extends NoInfer<NoInferAdvanced<readonly string[]>>,
  TD extends readonly TA[TB][],
> = TA[TB] extends string
  ? {
      readonly key: TB;
      readonly tags: TC;
      readonly refs: TD;
      readonly active: true;
    }
  : {
      readonly key: TB;
      readonly tags: TC;
      readonly refs: TD;
      readonly active: false;
    };

export type SolverConfig<
  TDomain extends SolverInput<string, `mode-${string}`>,
  TPayload extends SolverInput<string, `mode-${string}`>,
  TMode extends `mode-${string}`,
  TState extends object = Record<string, unknown>,
> = TDomain['mode'] extends TMode
  ? {
      readonly domain: TDomain['tenant'];
      readonly payload: TPayload;
      readonly mode: TMode;
      readonly state: TState & {
        readonly tenant: TDomain['tenant'];
        readonly requestId: TDomain['requestId'];
      };
    }
  : never;

export type SolverConstraintUnion<T extends SolverInput<string, `mode-${string}`>> = T extends infer U
  ? {
      [K in keyof U]-?: U[K] extends unknown ? K : never;
    }
  : never;

export type NarrowedPayload<
  T extends Record<string, unknown>,
  TPath extends string,
> = PathValue<T, TPath>;

export const assertPayload = <T>(value: T): value is T => value !== undefined && value !== null;

export type SolveInput<
  TKind extends string,
  TInput extends SolverInput<TKind, `mode-${string}`>,
  TMode extends `mode-${string}`,
  TState extends object,
> = TInput extends SolverInput<infer Kind, infer Mode>
  ? Kind extends TKind
    ? TMode extends Mode
      ? {
          readonly kind: Kind;
          readonly mode: Mode;
          readonly state: TState;
          readonly stamp: number;
          readonly marker: Brand<string, 'solver'>;
        }
      : never
    : never
  : never;

export function solveAtMost<T extends SolverInput<string, `mode-${string}`>, U extends NoInfer<T['mode']>>(
  input: T,
  constraint: ConstraintLayer<U extends `mode-${string}` ? readonly [U] : readonly ['mode-default']>,
  state: NoInferAdvanced<{ readonly active: true }>,
): ConflictResolution<T, readonly [T['mode']], Brand<string, 'marker'> > {
  return {
    input,
    layers: [input.mode],
    marker: `${input.requestId as string}::${input.mode}` as Brand<string, 'marker'>,
    score: input.stamps.length as ResolveScore<T, readonly [T['mode']]>,
    resolved: true,
  };
}

export function solveAtLeast<
  const TKind extends string,
  TInput extends SolverInput<TKind, `mode-${string}`>,
  TConfig extends SolverConfig<TInput, TInput, TInput['mode'], Record<string, string>>,
>(
  input: TInput,
  config: TConfig,
  payload: SolverConstraints<TInput, 'mode', readonly string[], readonly [TInput['mode']]>,
): ConflictState<TInput, TConfig> {
  return {
    input,
    output: config,
  };
}

export function solveChain<T extends SolverInput<string, `mode-${string}`>>(input: T, layers: readonly T['mode'][]): readonly T['mode'][];

export function solveChain<T extends SolverInput<string, `mode-${string}`>>(
  input: T,
  layers: readonly T['mode'][],
  fallback: NoInfer<T['mode']>,
): readonly T['mode'][];

export function solveChain<T extends SolverInput<string, `mode-${string}`>>(
  input: T,
  layers: readonly T['mode'][],
  fallback: NoInfer<T['mode']>,
  marker: Brand<string, 'marker'>,
): readonly T['mode'][];

export function solveChain<T extends SolverInput<string, `mode-${string}`>>(
  input: T,
  layers: readonly T['mode'][],
  fallback?: NoInfer<T['mode']>,
  marker?: Brand<string, 'marker'>,
  state?: SolverEnvelope<T['tenant'], T['mode'], T>,
): readonly T['mode'][] {
  if (!layers.length) {
    const base = [fallback] as readonly T['mode'][];
    return marker && state ? [...base, `${input.mode}` as T['mode']] : base;
  }
  return layers;
}

type SolverModeArray = readonly [`mode-fast`, `mode-safe`, `mode-diagnostic`];

export type SolverSatisfies<T extends SolverModeArray> = T[number] extends `mode-${string}` ? T : never;

export const modeCatalog = ['mode-fast', 'mode-safe', 'mode-diagnostic'] as const satisfies SolverModeArray;

export type SolverCatalog = typeof modeCatalog;
export type SolverCatalogUnion = SolverCatalog[number];
export type SolverState = Record<string, { active: boolean; value: number }>;

export const solverProfile = {
  'mode-fast': { active: true, value: 1 },
  'mode-safe': { active: true, value: 2 },
  'mode-diagnostic': { active: false, value: 3 },
} satisfies SolverState;

export const runSolverWithConstraints = <TInput extends SolverInput<string, `mode-${string}`>>(
  input: TInput,
): ConflictResolution<TInput, readonly TInput['mode'][], Brand<string, 'marker'>> => {
  const profile = solverProfile[input.mode as SolverCatalogUnion];
  return {
    input,
    layers: [input.mode],
    marker: `${input.requestId}#${input.mode}` as Brand<string, 'marker'>,
    score: (input.mode ? profile.value : 0) as ResolveScore<TInput, readonly TInput['mode'][]>,
    resolved: true,
  };
};

export const assertResolved = <T>(
  result: ConflictResolution<T, readonly string[], Brand<string, 'marker'>>,
): result is ConflictResolution<T, readonly string[], Brand<string, 'marker'>> => result.resolved;
