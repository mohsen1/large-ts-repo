import { type Brand, type NoInfer } from '@shared/type-level';

export type QuantumPluginKind = 'source' | 'transform' | 'gate' | 'safety' | 'synthesis';

export type PluginName<T extends string = string> = Brand<`plugin:${T}`, 'quantum-plugin-name'>;
export type PluginNamespace = Brand<`namespace:${string}`, 'quantum-namespace'>;
export type PluginDependency<TName extends string = string> = PluginName<TName>;
export type PluginDependencyList<TName extends string = string> = readonly PluginDependency<TName>[];
export type BrandedErrorCode = string;

export type PluginMetadata = {
  readonly createdAt: string;
  readonly version: `v${number}.${number}.${number}`;
  readonly owner: `owner:${string}`;
};

export type PluginExecutionContext<TContext = {}> = {
  readonly runId: `run:${string}`;
  readonly tenant: `tenant:${string}`;
  readonly node: `node:${string}`;
  readonly metadata: Readonly<TContext>;
};

export type PluginOutcomeStatus = 'success' | 'skipped' | 'error';

export type PluginOutcome<TPayload = unknown> =
  | {
      readonly status: 'success';
      readonly skipped: false;
      readonly payload: Readonly<TPayload>;
      readonly artifacts: readonly string[];
      readonly elapsedMs: number;
    }
  | {
      readonly status: 'skipped';
      readonly skipped: true;
      readonly payload: null;
      readonly artifacts: readonly string[];
      readonly elapsedMs: 0;
    }
  | {
      readonly status: 'error';
      readonly skipped: false;
      readonly payload: null;
      readonly artifacts: readonly string[];
      readonly elapsedMs: number;
      readonly reason: {
        readonly code: string;
        readonly details: readonly string[];
      };
    };

export type PluginDefinition<
  TInput,
  TOutput,
  TNamespace extends string = string,
  TName extends string = string,
  TTag extends string = string,
  TKind extends QuantumPluginKind = QuantumPluginKind,
> = Readonly<{
  readonly namespace: TNamespace;
  readonly name: PluginName<TName>;
  readonly kind: TKind;
  readonly tags: readonly TTag[];
  readonly dependsOn: PluginDependencyList<TName>;
  readonly metadata: PluginMetadata;
  readonly run: (
    input: NoInfer<TInput>,
    context: PluginExecutionContext,
  ) => Promise<PluginOutcome<TOutput>>;
  readonly transform: (input: NoInfer<TInput>, context: PluginExecutionContext) => Promise<NoInfer<TOutput>>;
}>;

export type PluginByName<TPlugins extends readonly PluginDefinition<any, any, any, any>[], TName extends string> =
  Extract<TPlugins[number], { readonly name: PluginName<TName> }>;

export type PluginPayload<TPlugins extends readonly PluginDefinition<any, any, any, any>[], TName extends string> =
  TPlugins extends readonly [infer H extends PluginDefinition<any, any, any, any>, ...infer R extends readonly PluginDefinition<any, any, any, any>[]]
    ? H['name'] extends PluginName<TName>
      ? TPlugins extends readonly [H, ...infer _]
        ? H
        : never
      : PluginPayload<R & readonly PluginDefinition<any, any, any, any>[], TName>
    : never;

export type PluginInput<TPlugin extends PluginDefinition<any, any, any, any>> = TPlugin extends PluginDefinition<infer TInput, any> ? TInput : never;
export type PluginOutput<TPlugin extends PluginDefinition<any, any, any, any>> = TPlugin extends PluginDefinition<any, infer TOutput> ? TOutput : never;

export type PluginInputByName<
  TPlugins extends readonly PluginDefinition<any, any, any, any>[],
  TName extends string,
> = PluginInput<PluginPayload<TPlugins, TName>>;

export type PluginOutputByName<
  TPlugins extends readonly PluginDefinition<any, any, any, any>[],
  TName extends string,
> = PluginOutput<PluginPayload<TPlugins, TName>>;

export type PluginRecord<TPlugins extends readonly PluginDefinition<any, any, any, any>[]> = {
  readonly [Key in TPlugins[number] as Key['name']]: {
    readonly namespace: Key['namespace'];
    readonly kind: Key['kind'];
    readonly input: PluginInput<Key>;
    readonly output: PluginOutput<Key>;
  };
};

export type NamespaceMap<TPlugins extends readonly PluginDefinition<any, any, any, any>[]> = {
  [T in TPlugins[number] as T['namespace']]: readonly T['name'][];
};

export type RemappedPluginKeys<TPlugins extends readonly PluginDefinition<any, any, any, any>[]> = {
  [K in TPlugins[number] as K['namespace'] extends string ? `ns:${K['namespace']}` : never]: K;
};

export type PluginRuntimeTuple<TPlugins extends readonly PluginDefinition<any, any, any, any>[]> =
  TPlugins extends readonly [infer Head extends PluginDefinition<any, any, any, any>, ...infer Tail extends readonly PluginDefinition<any, any, any, any>[]]
    ? readonly [Head, ...PluginRuntimeTuple<Tail>]
    : readonly [];

export const definePlugin = <
  TName extends string,
  TInput,
  TOutput,
  TNamespace extends string,
  TTag extends string,
  TKind extends QuantumPluginKind = QuantumPluginKind,
>(
  definition: PluginDefinition<TInput, TOutput, TNamespace, TName, TTag, TKind>,
): PluginDefinition<TInput, TOutput, TNamespace, TName, TTag, TKind> => {
  return definition;
};

export const pluginKinds = ['source', 'transform', 'gate', 'safety', 'synthesis'] as const satisfies readonly QuantumPluginKind[];

export const tagForKind = <T extends QuantumPluginKind>(kind: T): `kind:${T}` => {
  return `kind:${kind}`;
};

export const mapPluginDependencyChain = <
  TPlugins extends readonly PluginDefinition<any, any, any, any>[],
>(
  plugins: TPlugins,
  names: readonly string[],
): readonly PluginName[] => {
  const lookup = new Set(plugins.map((entry) => entry.name));
  return names.filter((entry): entry is PluginName => lookup.has(entry as PluginName));
};

export type RecursiveTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail] ? readonly [Head, ...RecursiveTuple<Tail>] : readonly [];

export type NormalizePluginName<T extends string> = T extends `plugin:${infer Name}` ? Name : never;

export type PluginNameFromRoute<T extends string> = T extends `${infer Kind}/${infer Name}` ? NormalizePluginName<Name> : never;

export type RoutedPlugin<T extends string> = T extends `${infer Namespace}/${infer Name}`
  ? {
      readonly namespace: Namespace;
      readonly name: PluginName<Name>;
    }
  : never;

export type TemplatePluginUnion<T extends string> = T extends infer U extends string
  ? U extends `${infer Namespace}/${infer Name}`
    ? RoutedPlugin<U>
    : never
  : never;

export const splitRoute = (value: string): { namespace: string; name: string } => {
  const [namespace, name] = value.split('/') as [string, string];
  return { namespace, name };
};

export const pluginPath = <TNamespace extends string, TName extends string>(namespace: TNamespace, plugin: TName): PluginName<`${TNamespace}/${TName}`> =>
  `plugin:${namespace}/${plugin}` as PluginName<`${TNamespace}/${TName}`>;

export const ensurePluginName = <TNamespace extends string, TName extends string>(namespace: TNamespace, plugin: TName): PluginName<`${TNamespace}/${TName}`> =>
  pluginPath(namespace, plugin);
