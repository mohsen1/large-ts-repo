export type NoInfer<T> = [T][T extends never ? 1 : 0];
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type VarianceIn<T> = <S>(value: T) => S extends T ? S : never;
export type VarianceOut<T> = <S>() => S extends T ? T : never;
export type VarianceInOut<T> = {
  readonly in: (value: T) => void;
  readonly out: () => T;
};

export interface PluginSurface<TId extends string, TInput, TOutput> {
  readonly id: Brand<TId, 'PluginId'>;
  readonly input: TInput;
  readonly output: TOutput;
}

export interface NamedPlugin<TName extends string, TInput, TOutput, TMeta extends Record<string, unknown> = Record<string, unknown>>
  extends PluginSurface<TName, TInput, TOutput> {
  readonly meta: TMeta;
  readonly dependsOn: readonly Brand<string, 'PluginId'>[];
}

export type PluginMap = Record<string, NamedPlugin<string, unknown, unknown>>;

export type InferPluginInput<T> = T extends PluginSurface<any, infer I, any> ? I : never;
export type InferPluginOutput<T> = T extends PluginSurface<any, any, infer O> ? O : never;

export type RegistryRecord<T extends PluginMap> = {
  readonly [K in keyof T]: T[K] extends PluginSurface<infer I, infer In, infer Out>
    ? PluginSurface<I & string, In, Out>
    : never;
};

export type ExpandTemplate<T extends string> = T extends `${infer A}-${infer B}-${infer C}`
  ? {
      readonly level1: A;
      readonly level2: B;
      readonly level3: C;
    }
  : { readonly raw: T };

export type RemapPluginKeys<T extends Record<string, unknown>> = {
  [K in keyof T & string as `plugin:${Uppercase<K>}`]: T[K];
};

export type ConstrainIntersection<TA, TB> = TA & TB & {
  readonly constraints: {
    left: string;
    right: string;
  };
};

export type DeepIntersection<T extends readonly object[]> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends object
    ? Rest extends readonly object[]
      ? Head & DeepIntersection<Rest>
      : Head
    : never
  : {};

export interface ConstraintSolver<
  A extends string,
  B extends string,
  C extends Record<A, B>,
  D extends keyof C,
  E extends NoInfer<C[D]>[],
  F extends A & string = A,
> {
  readonly left: A;
  readonly right: B;
  readonly catalog: C;
  readonly focus: D;
  readonly samples: E;
  readonly defaultValue: F;
}

export type MutualConstraint<A, B> = A extends B ? (B extends A ? true : false) : false;
export type ConstraintRing<
  T extends string,
  U extends string,
  V extends Record<T, U>,
  W extends keyof V = keyof V,
> = W extends keyof V ? { [K in W]: ConstraintSolver<T, U, V, W, NoInfer<V[W][]>> } : never;

export type SolveConstraint<
  T extends readonly ConstraintSolver<string, string, Record<string, string>, keyof Record<string, string>, string[]>[],
> = {
  readonly solved: {
    readonly key: T[number] extends ConstraintSolver<infer L, infer _R, any, infer K, any, any> ? K : never;
    readonly checks: T[number] extends infer Item
      ? Item extends ConstraintSolver<infer L, infer R, infer _C, infer K, infer Samples, infer _F>
        ? MutualConstraint<L, R> extends true
          ? readonly [...(Samples extends readonly string[] ? Samples : []), `${string & K}:${L}->${R}`]
          : never
        : never
      : never;
  };
};

export type TemplateRoute<T extends string> =
  T extends `${infer Domain}/${infer Entity}/${infer Action}` ? `${Uppercase<Domain>}:${Uppercase<Entity>}:${Uppercase<Action>}` : never;

export type ParseAction<T extends string> =
  T extends `${infer Left}-${infer Right}` ? Left | Right : T;

export type TransformMap<T extends Record<string, unknown>> = {
  [K in keyof T as ParseAction<K & string>]: T[K] extends number
    ? ReadonlyArray<T[K]>
    : T[K] extends string
      ? Brand<T[K], 'Transformed'>
      : T[K] extends object
        ? TransformMap<T[K] extends Record<string, unknown> ? T[K] : { value: T[K] }>
        : T[K];
};

export type PluginMatrix<
  T extends readonly string[],
  TResult extends readonly PluginSurface<string, unknown, unknown>[] = [],
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends readonly string[]
      ? PluginMatrix<Tail, readonly [...TResult, PluginSurface<Head, Plugin<Head>, Plugin<`resolved-${Head}`>>]>
      : never
    : PluginMatrix<Tail & readonly string[], TResult>
  : TResult;

export type Plugin<Id extends string> = {
  readonly id: Id;
  readonly payload: { readonly [K in Id]: K };
};

export type BuildTuple<T extends number, TAggregate extends unknown[] = []> = TAggregate['length'] extends T
  ? TAggregate
  : BuildTuple<T, [...TAggregate, Brand<string, 'TupleCell'>]>;

export type MutateTuple<
  T,
  N extends number,
  I extends 0[] = [],
  Out extends unknown[] = [],
> = I['length'] extends N ? Out : MutateTuple<T, N, [...I, 0], [...Out, { readonly wrap: T; readonly index: I['length'] }]>;

export type ChainResult<T extends readonly PluginSurface<string, unknown, unknown>[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends PluginSurface<infer Id, infer In, infer Out>
    ? Tail extends readonly PluginSurface<string, unknown, unknown>[]
      ? {
          readonly name: Id;
          readonly inbound: In;
          readonly outbound: Out;
          readonly next: ChainResult<Tail>;
        }
      : {
          readonly name: Id;
          readonly inbound: In;
          readonly outbound: Out;
        }
    : never
  : never;

export interface SolverFactory<
  TKind extends string,
  TInput,
  TOutput,
  TMeta extends Record<string, unknown>,
> extends PluginSurface<TKind, TInput, TOutput> {
  readonly id: Brand<TKind, 'PluginId'>;
  readonly kind: TKind;
  readonly meta: TMeta;
}

export type SolverOverload<
  TKind extends string,
  TInput,
  TOutput,
  TMeta extends Record<string, unknown>,
> = {
  <TOverride extends string>(kind: TKind, input: TInput, output: TOutput, override: TOverride): SolverFactory<TKind, TInput, TOutput, TMeta & { override: TOverride }>;
  <TGuard extends Record<string, unknown>>(kind: TKind, input: TInput, output: TOutput, guard: TGuard, strict: true): SolverFactory<
    TKind,
    TInput,
    TOutput,
    TMeta & { guard: TGuard; strict: true }
  >;
  <TContext extends Record<string, unknown>>(kind: TKind, input: TInput, output: TOutput, context: TContext): SolverFactory<TKind, TInput, TOutput, TMeta & { context: TContext }>;
  <TContext extends Record<string, unknown>, TToken extends string>(
    kind: TKind,
    input: TInput,
    output: TOutput,
    context: TContext,
    marker: Brand<TToken, 'FactoryMarker'>,
  ): SolverFactory<
    TKind,
    TInput,
    TOutput,
    TMeta & { context: TContext; marker: TToken }
  >;
};

export const createSolverFactory = <
  TKind extends string,
  TInput,
  TOutput,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>(
  kind: TKind,
  input: TInput,
  output: TOutput,
  meta?: TMeta,
): SolverFactory<TKind, TInput, TOutput, TMeta> => ({
  id: kind as Brand<TKind, 'PluginId'>,
  kind,
  input,
  output,
  meta: meta ?? ({} as TMeta),
});

export type SolverInvocation<T extends PluginSurface<string, any, any>> = {
  readonly kind: T['id'];
  readonly input: T['input'];
  readonly output: T['output'];
  readonly execute: (input: T['input']) => Promise<T['output']>;
};

export type RegistryInput = readonly {
  readonly id: string;
  readonly inputs: readonly unknown[];
  readonly weight: number;
  readonly enabled: boolean;
  readonly tags: readonly string[];
}[];

export type PluginBucket<T extends RegistryInput> = {
  [K in T[number] as K['id']]: Readonly<K>;
};

export type PluginConstraintHub<TBuckets extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof TBuckets & string as `${TPrefix}${K}`]: {
    readonly input: K;
    readonly output: TBuckets[K];
  };
};

export type RouteParse<T extends string> = T extends `${infer Domain}/${infer Entity}/${infer Action}`
  ? {
      readonly domain: Domain;
      readonly entity: Entity;
      readonly action: Action;
      readonly raw: T;
    }
  : {
      readonly raw: T;
    };

export const pluginKernel = <
  TPlugins extends readonly PluginSurface<string, unknown, unknown>[],
>(
  plugins: TPlugins,
) => {
  const base = new Map<string, SolverFactory<string, unknown, unknown, Record<string, unknown>>>();
  for (const plugin of plugins) {
    base.set(plugin.id, {
      id: plugin.id,
      kind: plugin.id,
      input: plugin.input,
      output: plugin.output,
      meta: {},
    });
  }
  return {
    size: base.size,
    map: base,
    keys: Array.from(base.keys()),
  };
};

export const registryBlueprint = {
  root: 'core',
  plugins: ['auth', 'telemetry', 'orchestration', 'analytics', 'timeline', 'mesh', 'policy', 'resilience'] as const,
} satisfies {
  root: string;
  plugins: readonly `${string}`[];
};

export const pluginProfiles = pluginKernel([
  createSolverFactory('recovery', { id: 1 }, { kind: 'ok' }),
  createSolverFactory('forecast', { horizon: 5 }, { kind: 'ok' }),
  createSolverFactory('stability', { retries: 3 }, { kind: 'ok' }),
  createSolverFactory('policy', { policy: 'baseline' }, { kind: 'ok' }),
  createSolverFactory('route', { route: '/recovery' }, { kind: 'ok' }),
  createSolverFactory('timeline', { cursor: 0 }, { kind: 'ok' }),
]);

export type PluginProfileTokens = typeof pluginProfiles['keys'][number];
export type RouteTemplateMap = TemplateRoute<'incident/recovery/simulate'>;
export type RouteMatchState = RouteParse<RouteTemplateMap>;
export type ParsedBundle = {
  readonly tokenized: BrandedRouteBundle[];
};

export type BrandedRouteBundle = `${string}:${string}:${string}`;

export const tokenRegistry = (names: readonly string[]) => names.map((name) => `${name}-bundle` as BrandedRouteBundle);

export interface PluginHub {
  register: (profile: { readonly id: string; readonly token: string }) => void;
  snapshot: () => PluginProfileTokens[];
}

export const pluginHub = (): PluginHub => {
  const profile: string[] = [];
  return {
    register: (entry) => {
      profile.push(`${entry.id}:${entry.token}`);
    },
    snapshot: () => [...profile] as PluginProfileTokens[],
  };
};
