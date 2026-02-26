import type { NoInfer } from './patterns';

export type Direction = 'north' | 'south' | 'east' | 'west' | 'center';
export type SolverDomain = 'incident' | 'telemetry' | 'policy' | 'mesh' | 'runtime' | 'runtime-proxy' | 'orchestrator';

export type PluginId = `plugin-${string}`;
export type PluginBrand<T extends string> = T & { readonly __brand: 'Plugin' };
export type BrandedPlugin<T extends string> = PluginBrand<T>;

export type PluginContract<TInput, TOutput> = {
  readonly input: TInput;
  readonly output: TOutput;
  readonly version: `${number}.${number}.${number}`;
};

export type PluginConfig<TConstraint extends Record<string, unknown>, TMode extends string = string> = {
  readonly kind: TMode;
  readonly constraints: TConstraint;
  readonly direction: Direction;
  readonly timeoutMs: number;
};

export type PluginRegistryEntry<
  TName extends PluginId,
  TInput,
  TOutput,
  TConstraint extends Record<string, unknown>,
  TMode extends string = string,
> = {
  readonly id: BrandedPlugin<TName>;
  readonly contract: PluginContract<TInput, TOutput>;
  readonly config: PluginConfig<TConstraint, TMode>;
};

export type PluginOutput<T> = T extends { output: infer O } ? O : never;
export type PluginInput<T> = T extends { input: infer I } ? I : never;

export type PluginSolver<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? PluginOutput<Head> & PluginSolver<Tail>
  : {};

export type SolveConstraint<
  TInput,
  TOutput,
  TConstraint extends Record<string, unknown>,
  TMode extends string,
> = PluginConfig<TConstraint, TMode> extends infer C
  ? C extends { constraints: infer K }
    ? {
        readonly input: TInput;
        readonly output: TOutput;
        readonly constraintKeys: keyof K & string;
        readonly mode: TMode;
        readonly direction: C extends { direction: infer D } ? D : 'center';
      }
    : never
  : never;

export type ConstraintGraph<T extends readonly Record<string, Record<string, unknown>>[]> = {
  [K in keyof T]: keyof T[K] & string;
}[number];

export type PluginTuple<
  TName extends PluginId,
  TInput,
  TOutput,
  TConstraint extends Record<string, unknown>,
  TMode extends string = string,
> = readonly [
  name: PluginId,
  entry: PluginRegistryEntry<TName, TInput, TOutput, TConstraint, TMode>,
  solver: (input: TInput, config: PluginConfig<TConstraint, TMode>) => TOutput,
];

export interface PluginFactory<
  TMode extends string = string,
  TConstraint extends Record<string, unknown> = Record<string, unknown>,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly mode: TMode;
  readonly create: (
    id: PluginId,
    contract: PluginContract<TInput, TOutput>,
    config: PluginConfig<TConstraint, TMode>,
  ) => PluginRegistryEntry<`plugin-${string}`, TInput, TOutput, TConstraint, TMode>;
}

export type PluginFactoryInvoker<
  TFactory extends PluginFactory<string, Record<string, unknown>, unknown, unknown>,
  TInput,
  TOutput,
> = TFactory extends PluginFactory<infer TMode, infer TConstraint, infer FInput, infer FOutput>
  ? FInput extends TInput
    ? FOutput extends TOutput
      ? (payload: TInput, config: PluginConfig<TConstraint & Record<string, unknown>, TMode>) => TOutput
      : never
    : never
  : never;

export interface RegistryRecord<
  TName extends PluginId,
  TInput,
  TOutput,
  TConstraint extends Record<string, unknown>,
  TMode extends string,
> {
  readonly key: TName;
  readonly create: (
    input: TInput,
    config: PluginConfig<TConstraint, TMode>,
  ) => PluginRegistryEntry<TName, TInput, TOutput, TConstraint, TMode>;
  readonly run: (input: TInput, config: PluginConfig<TConstraint, TMode>) => TOutput;
}

export type PluginEnvelope = <T extends PluginRegistryEntry<PluginId, unknown, unknown, Record<string, unknown>, string>>(
  entry: T,
  input: PluginInput<T>,
  config: PluginConfig<
    T extends PluginRegistryEntry<PluginId, unknown, unknown, infer C, infer M> ? C : Record<string, unknown>,
    T extends PluginRegistryEntry<PluginId, unknown, unknown, any, infer M> ? M : string
  >,
) => PluginOutput<T>;

export type NoInferPlugin<T> = T extends unknown ? [T][0] : never;

export const createPluginRegistry = <
  const TItems extends readonly PluginRegistryEntry<PluginId, unknown, unknown, Record<string, unknown>, string>[],
>(
  ...entries: TItems
) => {
  const byId = new Map<PluginId, PluginRegistryEntry<PluginId, unknown, unknown, Record<string, unknown>, string>>();
  for (const entry of entries) {
    byId.set(entry.id, entry as PluginRegistryEntry<PluginId, unknown, unknown, Record<string, unknown>, string>);
  }
  return {
    entries,
    get: <TName extends PluginId>(id: TName) =>
      byId.get(id) as PluginRegistryEntry<TName, unknown, unknown, Record<string, unknown>, string> | undefined,
    size: entries.length,
  };
};

export const composePlugins = <TSeed>(
  seed: TSeed,
  ...plugins: readonly ((input: any) => any)[]
) => {
  let output: any = seed;
  for (const plugin of plugins) {
    output = plugin(output);
  }
  return output as TSeed;
};

export const normalizeDirection = (direction: Direction): Direction =>
  direction === 'north' || direction === 'south' || direction === 'east' || direction === 'west' || direction === 'center'
    ? direction
    : 'center';

export const makePluginEntry = <
  const Name extends PluginId,
  TInput,
  TOutput,
  C extends Record<string, unknown>,
  const Mode extends string,
>(
  name: Name,
  contract: PluginContract<TInput, TOutput>,
  config: PluginConfig<C, Mode>,
  run: (input: NoInferPlugin<TInput>, context: PluginConfig<NoInferPlugin<C>, Mode>) => TOutput,
): PluginRegistryEntry<Name, TInput, TOutput, C, Mode> => ({
  id: `${name}` as BrandedPlugin<Name>,
  contract,
  config: {
    ...config,
    direction: normalizeDirection(config.direction),
  },
}) as PluginRegistryEntry<Name, TInput, TOutput, C, Mode>;

export const solveRoute = <
  const TInput,
  const TOutput,
  const TMode extends string,
  const TConstraint extends Record<string, unknown>,
>(
  input: NoInfer<TInput>,
  config: NoInfer<PluginConfig<TConstraint, TMode>>,
  plugins: readonly RegistryRecord<
    PluginId,
    TInput,
    TOutput,
    TConstraint,
    TMode
  >[],
): TOutput[] => {
  const out: TOutput[] = [];
  for (const plugin of plugins) {
    out.push(plugin.run(input, config));
  }
  return out;
};

export const pluginEnvelope = <T extends readonly RegistryRecord<PluginId, unknown, unknown, Record<string, unknown>, string>[]>(
  route: SolverDomain,
  routeSeed: NoInfer<{ readonly domain: SolverDomain; readonly route: string }>,
  registry: T,
): {
  readonly route: SolverDomain;
  readonly runCount: T['length'];
  readonly outputs: PluginSolver<T>;
  readonly catalog: readonly string[];
} => {
  const outputs: unknown[] = [];
  const catalog: string[] = [];
  for (let i = 0; i < registry.length; i += 1) {
    const entry = registry[i];
    if (entry) {
      const output = entry.run(routeSeed, {
        kind: entry.run.toString(),
        constraints: {},
        direction: 'center',
        timeoutMs: 500,
      });
      outputs.push(output);
      catalog.push(`${route}:${String(i)}:${entry.key}`);
    }
  }

  return {
    route,
    runCount: registry.length,
    outputs: outputs as unknown as PluginSolver<T>,
    catalog,
  };
};

export const solverDomainCatalog = [
  'incident',
  'telemetry',
  'policy',
  'mesh',
  'runtime',
  'runtime-proxy',
  'orchestrator',
] as const satisfies readonly SolverDomain[];

export const pluginCatalog = new Map<PluginId, PluginRegistryEntry<PluginId, unknown, unknown, Record<string, unknown>, string>>();

export type RegistryMatrix = {
  readonly [K in SolverDomain]: readonly RegistryRecord<`plugin-${string}`, { readonly domain: K }, unknown, Record<string, unknown>, string>[];
};

export const createDomainRegistry = <T extends SolverDomain>(domain: T): RegistryMatrix[T] => {
  const key: PluginId = `plugin-${domain}-resolver` as PluginId;
  const contract: PluginContract<{ readonly domain: T }, { readonly kind: T; readonly resolved: true }> = {
    input: { domain },
    output: { kind: domain, resolved: true },
    version: '1.2.3',
  };

  const config: PluginConfig<Record<string, unknown>, string> = {
    kind: 'resolve',
    constraints: { stage: 'init', domain },
    direction: 'center',
    timeoutMs: 100,
  };

  const entry: RegistryRecord<PluginId, { readonly domain: T }, { readonly kind: T; readonly resolved: true }, Record<string, unknown>, string> = {
    key,
    create: () => ({
      id: key as BrandedPlugin<`plugin-${T & string}`>,
      contract,
      config: {
        ...config,
        constraints: config.constraints,
      },
    }),
    run: (input) => ({
      kind: input.domain,
      resolved: true,
    }),
  };

  const record = entry as RegistryRecord<`plugin-${T & string}`, { readonly domain: T }, { readonly kind: T; readonly resolved: true }, Record<string, unknown>, string>;
  return [record] as unknown as RegistryMatrix[T];
};

export const makePluginRecord = <
  const TName extends PluginId,
  TInput,
  TOutput,
  const TConstraint extends Record<string, unknown> = Record<string, unknown>,
  const TMode extends string = 'plugin',
>(
  name: TName,
  contract: PluginContract<TInput, TOutput>,
  config: PluginConfig<TConstraint, TMode>,
): PluginRegistryEntry<TName, TInput, TOutput, TConstraint, TMode> => ({
  id: name as BrandedPlugin<TName>,
  contract,
  config,
});
