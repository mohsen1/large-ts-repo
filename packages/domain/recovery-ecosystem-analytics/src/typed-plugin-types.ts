import {
  mapTupleRecursively,
  mapWithIteratorHelpers,
  type JsonObject,
  type JsonValue,
  type NoInfer,
} from '@shared/type-level';
import {
  asNamespace,
  asRun,
  asSession,
  asTenant,
  asWindow,
  type AnalyticsRun,
  type AnalyticsTenant,
  type AnalyticsWindow,
  type SignalNamespace,
} from './identifiers';
import { asSignalAlias } from './models';

export type PluginKind<TKind extends string = string> = `plugin:${TKind}`;
export type PluginName<TName extends string = string> = `plugin:${TName}`;
export type PluginNamespace<TNamespace extends string = string> = `namespace:${TNamespace}`;
export type PluginInputLabel<TName extends string = string> = `in:${TName}`;
export type PluginOutputLabel<TName extends string = string> = `out:${TName}`;
export type PluginDependency<TName extends string = string> = PluginName<TName>;
export type PluginSignalKind = `signal:${string}`;
export type PluginRouteToken = `route:${string}`;
export type PluginTraceId<TSeed extends string = string> = `trace:${TSeed}`;
export type PluginEnvelopeVersion = 'v1' | 'v2' | 'v3';

export interface PluginRunContext {
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
  readonly window: AnalyticsWindow;
  readonly runId: PluginRunId;
  readonly trace: PluginTraceId;
}

export interface PluginRunInput {
  readonly runId: PluginRunId;
  readonly kind: PluginSignalKind;
  readonly namespace: SignalNamespace;
  readonly at: string;
  readonly value: number;
  readonly payload: JsonValue;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface PluginRunResult<TPayload = unknown> {
  readonly plugin: PluginName;
  readonly accepted: boolean;
  readonly signalCount: number;
  readonly payload: TPayload;
  readonly diagnostics: readonly {
    readonly step: string;
    readonly latencyMs: number;
    readonly trace?: PluginTraceId;
  }[];
}

export interface PluginRunEnvelope<TNode extends PluginNode = PluginNode, TOutput = JsonValue> {
  readonly runId: PluginTraceId;
  readonly signal: PluginRunInput;
  readonly plugin: TNode;
  readonly output: TOutput;
  readonly createdAt: string;
}

export interface PluginNode<
  TName extends string = string,
  TKind extends string = string,
  TInput = PluginRunInput,
  TOutput = PluginRunResult,
  TNamespace extends string = string,
> {
  readonly name: PluginName<TName>;
  readonly namespace: PluginNamespace<TNamespace>;
  readonly kind: PluginKind<TKind>;
  readonly dependsOn: readonly PluginDependency<TKind>[];
  readonly inputKinds: readonly PluginInputLabel<TKind>[];
  readonly outputKinds: readonly PluginOutputLabel<TKind>[];
  readonly weight: number;
  readonly signature: string;
  readonly version: PluginEnvelopeVersion;
  readonly metadata?: Readonly<{
    readonly owner: string;
    readonly domain: string;
    readonly createdAt: string;
    readonly tags: readonly string[];
  }>;
  readonly run: (input: NoInfer<TInput>, context: PluginRunContext) => Promise<NoInfer<TOutput>>;
}

export type PluginRunId = AnalyticsRun;

export type PluginRoute<TPlugins extends readonly PluginNode[]> = TPlugins extends readonly [
  infer THead extends PluginNode,
  ...infer TRest extends readonly PluginNode[],
]
  ? readonly [THead['name'], ...PluginRoute<TRest>]
  : readonly [];

export type PluginRouteSignature<TPlugins extends readonly PluginNode[]> = PluginRoute<TPlugins> extends readonly PluginName[]
  ? PluginRoute<TPlugins> extends readonly []
    ? 'empty'
    : `${PluginRoute<TPlugins>[number] & string}::${PluginRoute<TPlugins>['length']}`
  : never;

export type PluginCatalogRecord<TPlugins extends readonly PluginNode[]> = {
  [K in TPlugins[number] as K['name']]: Readonly<{
    readonly node: K;
    readonly enabled: boolean;
    readonly registeredAt: string;
    readonly aliases: readonly string[];
  }>;
};

export type PluginSignalFlow<TPlugins extends readonly PluginNode[]> = {
  readonly id: `flow:${string}`;
  readonly path: PluginRoute<TPlugins>;
  readonly signature: PluginRouteSignature<TPlugins>;
};

export type PluginRouteMap<TPlugins extends readonly PluginNode[]> = {
  [TPlugin in TPlugins[number] as TPlugin['name']]: TPlugin;
};

export type PluginPayloadByKind<
  TItems extends readonly PluginNode[],
  TKind extends string,
> = {
  [K in TItems[number] as K extends PluginNode<infer TName, infer TInputKind, infer TInput>
    ? TInputKind extends `plugin:${TKind}`
      ? TName
      : never
    : never]: K extends PluginNode<string, `plugin:${TKind}`, infer KInput, unknown> ? KInput : never;
};

export type PluginOutputByKind<
  TItems extends readonly PluginNode[],
  TKind extends string,
> = {
  [K in TItems[number] as K extends PluginNode<infer TName, infer TInputKind, unknown, infer KOutput>
    ? TInputKind extends `plugin:${TKind}`
      ? TName
      : never
    : never]: K extends PluginNode<string, `plugin:${TKind}`, unknown, infer KOutput> ? KOutput : never;
};

export type PluginSignature<TKind extends string, TInput, TOutput> = `${TKind}:${string & keyof TInput}:${string & keyof TOutput}`;
export type PluginRouteMapSignature<TPlugins extends readonly PluginNode[]> = PluginRouteSignature<TPlugins> extends infer TSignature
  ? TSignature extends string
    ? `route:${TSignature}`
    : never
  : never;

export type BrandedRoute<TSignature extends string> = `${TSignature}` & {
  readonly __brand: 'PluginRouteSignature';
};

const asBranded = <T extends string>(value: T): BrandedRoute<T> =>
  (value as unknown) as BrandedRoute<T>;

const isPluginNode = (value: unknown): value is PluginNode =>
  !!value &&
  typeof value === 'object' &&
  'name' in (value as Record<string, unknown>) &&
  'run' in (value as Record<string, unknown>);

const normalizePayload = (value: unknown): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizePayload) as JsonValue;
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, JsonValue>>((acc, [key, entryValue]) => {
      acc[key] = normalizePayload(entryValue);
      return acc;
    }, {}) as JsonObject;
  }
  return String(value);
};

export const toPluginTraceId = (seed: string): PluginTraceId =>
  (`trace:${seed.replace(/[^a-z0-9._-]+/gi, '-')}` as PluginTraceId);

export const normalizePluginKind = (kind: string): PluginKind =>
  (`plugin:${kind.toLowerCase().replace(/^plugin:/, '')}` as PluginKind);

export const normalizePluginInputKind = (kind: string): PluginInputLabel =>
  (`in:${kind.toLowerCase().replace(/^in:/, '')}` as PluginInputLabel);

export const normalizePluginOutputKind = (kind: string): PluginOutputLabel =>
  (`out:${kind.toLowerCase().replace(/^out:/, '')}` as PluginOutputLabel);

export const pluginNameFrom = (value: string): PluginName =>
  (value.startsWith('plugin:') ? value : `plugin:${value}`) as PluginName;

export const pluginNamespaceFrom = (value: string): PluginNamespace =>
  (`namespace:${value.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}` as PluginNamespace);

export const pluginKindFromSignal = (kind: string): PluginKind =>
  (`plugin:${kind.replace(/^signal:/, '').toLowerCase()}` as PluginKind);

export const pluginRouteSignature = <TPlugins extends readonly PluginNode[]>(
  plugins: NoInfer<TPlugins>,
): BrandedRoute<PluginRouteSignature<TPlugins>> => {
  const names = collectPluginNames(plugins);
  if (names.length === 0) {
    return asBranded('route:empty' as PluginRouteSignature<TPlugins>);
  }
  const route = names.join('::');
  return asBranded(`route:${route}` as PluginRouteSignature<TPlugins>);
};

export const pluginSignature = <T extends PluginNode>(
  plugin: NoInfer<T>,
): PluginSignature<
  PluginKind<T['kind'] & string>,
  T['run'] extends (input: infer I, _context: unknown) => Promise<unknown> ? I : JsonValue,
  T['run'] extends (_input: unknown, _context: unknown) => Promise<infer O> ? O : JsonValue
> => `${plugin.kind}::${Object.keys(plugin.metadata ?? {}).length}` as PluginSignature<
  PluginKind<T['kind'] & string>,
  T['run'] extends (input: infer I, _context: unknown) => Promise<unknown> ? I : JsonValue,
  T['run'] extends (_input: unknown, _context: unknown) => Promise<infer O> ? O : JsonValue
>;

export const pluginCatalogToMap = <TPlugins extends readonly PluginNode[]>(
  plugins: NoInfer<TPlugins>,
): PluginCatalogRecord<TPlugins> => {
  const map: Record<string, PluginCatalogRecord<TPlugins>[keyof PluginCatalogRecord<TPlugins>]> = {};
  for (const plugin of plugins) {
    if (!isPluginNode(plugin)) {
      continue;
    }
    const entry = {
      node: plugin,
      enabled: true,
      registeredAt: new Date().toISOString(),
      aliases: [asSignalAlias(plugin.name.replace('plugin:', ''))],
    };
    map[plugin.name] = entry as PluginCatalogRecord<TPlugins>[keyof PluginCatalogRecord<TPlugins>];
  }
  return map as unknown as PluginCatalogRecord<TPlugins>;
};

export const collectPluginNames = (plugins: readonly PluginNode[]): readonly PluginName[] =>
  mapWithIteratorHelpers(plugins, (entry) => entry.name);

export const collectPluginKinds = (plugins: readonly PluginNode[]): readonly PluginKind[] =>
  mapWithIteratorHelpers(plugins, (entry) => normalizePluginKind(entry.kind));

export const collectPluginNodeNames = (plugins: readonly PluginNode[]): readonly PluginSignalKind[] =>
  mapWithIteratorHelpers(plugins, (entry) => `signal:${entry.name.replace('plugin:', '')}` as PluginSignalKind);

export const createPluginContext = (
  tenant: string,
  namespace: string,
  runWindow = `window:${Date.now()}`,
): PluginRunContext => ({
  tenant: asTenant(tenant),
  namespace: asNamespace(namespace),
  window: asWindow(runWindow),
  runId: asRun(`run:${Date.now()}`),
  trace: toPluginTraceId(`${tenant}-${namespace}`),
});

export const pluginCatalogSeedNode = {
  name: 'plugin:baseline-normalizer' as const,
  namespace: 'namespace:core' as const,
  kind: 'plugin:normalize' as const,
  dependsOn: [] as const,
  inputKinds: ['in:normalize'] as const,
  outputKinds: ['out:normalize'] as const,
  weight: 12,
  signature: 'baseline-normalizer',
  version: 'v1' as const,
  metadata: {
    owner: 'recovery-ecosystem',
    domain: 'analytics',
    createdAt: new Date().toISOString(),
    tags: ['seed', 'baseline'],
  },
  run: async (
    input: PluginRunInput,
    _context,
  ): Promise<PluginRunResult> => ({
    plugin: 'plugin:baseline-normalizer',
    accepted: true,
    signalCount: input.value,
    payload: normalizePayload(input.payload),
    diagnostics: [{ step: 'baseline-normalizer', latencyMs: 1 }],
  }),
} satisfies PluginNode<
  'baseline-normalizer',
  'normalize',
  PluginRunInput,
  PluginRunResult,
  'core'
>;

export const pluginCatalogSeed = pluginCatalogToMap([pluginCatalogSeedNode]);
export const pluginCatalogSeedNodes = mapWithIteratorHelpers([pluginCatalogSeedNode], (entry) => entry);

export const withPluginEnvelope = <TNode extends PluginNode, TOutput>(
  plugin: NoInfer<TNode>,
  signal: PluginRunInput,
  output: TOutput,
): PluginRunEnvelope<TNode, TOutput> => ({
  runId: toPluginTraceId(signal.runId),
  signal,
  plugin,
  output,
  createdAt: new Date().toISOString(),
});

export type SeedPluginCatalogDescriptor = {
  readonly manifestId: `manifest:${string}`;
  readonly window: AnalyticsWindow;
  readonly catalog: typeof pluginCatalogSeed;
  readonly session: ReturnType<typeof asSession>;
};

export const seedPluginContext = (): SeedPluginCatalogDescriptor => ({
  manifestId: 'manifest:seed' as const,
  window: asWindow('window:seed'),
  catalog: pluginCatalogSeed,
  session: asSession('seed-session'),
});

export const pluginCatalogRouteTokens = (plugins: readonly PluginNode[]): readonly PluginRouteToken[] =>
  mapWithIteratorHelpers(plugins, (entry) => `route:${entry.name}` as PluginRouteToken);
