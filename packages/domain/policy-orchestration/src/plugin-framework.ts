import { Brand, withBrand } from '@shared/core';
import { NoInfer, RecursivePath } from '@shared/type-level';

export type PolicyPluginNamespace = 'discovery' | 'planner' | 'simulator' | 'executor' | 'telemetry';
export type PolicyPluginKind = `${PolicyPluginNamespace}-plugin`;
export type PolicyPluginScope = `${PolicyPluginKind}:${string}`;
export type PolicyRoute = `policy.${PolicyPluginNamespace}.${string}`;

export type PolicyPluginId = Brand<string, 'PolicyPluginId'>;
export type PolicyPluginVersion = Brand<string, 'PolicyPluginVersion'>;
export type PolicyPluginTraceId = Brand<string, 'PolicyPluginTraceId'>;

export interface PolicyPluginContext {
  readonly tenantId: string;
  readonly orchestratorId: string;
  readonly runId: string;
  readonly scope: PolicyPluginScope;
  readonly startedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PolicyPluginManifest<TName extends string = string, TKind extends PolicyPluginKind = PolicyPluginKind> {
  readonly pluginId: PolicyPluginId;
  readonly kind: TKind;
  readonly name: TName;
  readonly version: PolicyPluginVersion;
  readonly scope: PolicyPluginScope;
}

export interface PolicyPlugin<
  TName extends string = string,
  TKind extends PolicyPluginKind = PolicyPluginKind,
  TInput = unknown,
  TOutput = unknown,
  TConsumes extends readonly string[] = readonly [],
  TEmits extends readonly string[] = readonly [],
> extends PolicyPluginManifest<TName, TKind> {
  readonly consumes: TConsumes;
  readonly emits: TEmits;
  run(input: TInput, context: PolicyPluginContext): Promise<TOutput>;
}

export type AnyPolicyPlugin = PolicyPlugin<any, any, any, any, readonly string[], readonly string[]>;

export type PluginOutput<T extends AnyPolicyPlugin> = T extends PolicyPlugin<any, any, any, infer TOutput, any, any> ? TOutput : never;
export type PluginInput<T extends AnyPolicyPlugin> = T extends PolicyPlugin<any, any, infer TInput, any, any, any> ? TInput : never;

export type TemplateUnion<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Rest extends readonly string[]]
  ? Rest extends []
    ? `${Head}`
    : `${Head}/${TemplateUnion<Rest>}`
  : never;

export type RemapPluginOutputs<TCatalog extends readonly AnyPolicyPlugin[]> = {
  [Plugin in TCatalog[number] as `plugin:${Plugin['kind']}:${Plugin['name']}`]: PluginOutput<Plugin>;
};

export type RecursivePluginTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest extends readonly unknown[]]
  ? [Head, ...RecursivePluginTuple<Rest>]
  : [];

export type FoldPluginChain<
  TChain extends readonly AnyPolicyPlugin[],
  TSeed,
> = TChain extends readonly [infer Head extends AnyPolicyPlugin, ...infer Tail extends readonly AnyPolicyPlugin[]]
  ? Tail extends readonly AnyPolicyPlugin[]
    ? Tail extends []
      ? PluginOutput<Head>
      : FoldPluginChain<Tail, PluginOutput<Head>>
    : PluginOutput<Head>
  : TSeed;

export interface PluginHandle<TPlugin extends AnyPolicyPlugin> extends Disposable {
  readonly pluginId: PolicyPluginId;
  readonly name: TPlugin['name'];
  readonly plugin: TPlugin;
}

export interface PluginRegistryState<TCatalog extends readonly AnyPolicyPlugin[]> {
  readonly plugins: TCatalog;
  readonly total: number;
  readonly pluginIds: readonly PolicyPluginId[];
}

export interface PluginRunResult<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly pluginId: PolicyPluginId;
}

export type PluginRouteMap<T extends Record<string, unknown>> = {
  [K in keyof T & string]: string;
} & {
  readonly [key: `route:${string}`]: string;
};

export interface PluginFilter {
  readonly kind?: PolicyPluginKind;
  readonly names?: readonly string[];
  readonly scopes?: readonly PolicyPluginScope[];
  readonly traceId?: PolicyPluginTraceId;
}

const PLUGIN_KEY_PREFIX = 'policy.plugin.' as const;
const traceCounter = { value: 0 };

export const policyPluginId = (value: string): PolicyPluginId => withBrand(`${PLUGIN_KEY_PREFIX}${value}`, 'PolicyPluginId');
export const policyPluginVersion = (value: string): PolicyPluginVersion => withBrand(value, 'PolicyPluginVersion');
export const policyPluginTrace = (runId: string): PolicyPluginTraceId => {
  traceCounter.value += 1;
  return withBrand(`${runId}::trace-${traceCounter.value}`, 'PolicyPluginTraceId');
};

export const createPluginManifest = <
  TName extends string,
  TKind extends PolicyPluginKind,
>(
  name: TName,
  kind: TKind,
  version: string,
  scope: PolicyPluginScope,
): PolicyPluginManifest<TName, TKind> => ({
  pluginId: policyPluginId(`${kind}:${name}`),
  kind,
  name,
  version: policyPluginVersion(version),
  scope,
});

export const matchesFilter = (manifest: PolicyPluginManifest, filter: PluginFilter): boolean => {
  if (filter.kind && manifest.kind !== filter.kind) return false;
  if (filter.names?.length && !filter.names.includes(manifest.name)) return false;
  if (filter.scopes?.length && !filter.scopes.includes(manifest.scope)) return false;
  return true;
};

export const extractPluginKind = (input: string): PolicyPluginNamespace => {
  const [candidate] = input.split(':');
  if (!candidate) return 'planner';
  return candidate.endsWith('-plugin')
    ? (candidate.slice(0, candidate.length - '-plugin'.length) as PolicyPluginNamespace)
    : 'planner';
};

export class PolicyPluginRegistry<TCatalog extends readonly AnyPolicyPlugin[]> implements AsyncDisposable {
  private readonly catalog = new Map<PolicyPluginId, AnyPolicyPlugin>();
  private readonly byName = new Map<string, PolicyPluginId>();
  private readonly scope = new Set<string>();
  private readonly runLog: PluginRunResult<unknown, unknown>[] = [];
  private closed = false;

  public constructor(catalog: TCatalog) {
    for (const plugin of catalog) {
      this.catalog.set(plugin.pluginId, plugin);
      this.byName.set(plugin.name, plugin.pluginId);
      this.scope.add(plugin.scope);
    }
  }

  public get state(): PluginRegistryState<TCatalog> {
    const pluginIds = [...this.catalog.keys()];
    const plugins = [...this.catalog.values()] as unknown as TCatalog;
    return { plugins, total: pluginIds.length, pluginIds };
  }

  public get pluginNames(): readonly string[] {
    return [...this.byName.keys()].sort((left, right) => left.localeCompare(right));
  }

  public get history(): readonly PluginRunResult<unknown, unknown>[] {
    return [...this.runLog];
  }

  public list(filter: PluginFilter = {}): readonly AnyPolicyPlugin[] {
    const filtered = [...this.catalog.values()].filter((plugin) =>
      matchesFilter(plugin as PolicyPluginManifest, filter),
    );
    type IteratorChain<T> = IterableIterator<T> & {
      filter(condition: (value: T) => boolean): IteratorChain<T> & { toArray(): T[] };
      map<U>(transform: (value: T) => U): IteratorChain<U> & { toArray(): U[] };
      toArray(): T[];
    };

    const iteratorFrom = (globalThis as {
      Iterator?: {
        from?: <T>(value: Iterable<T>) => IteratorChain<T>;
      };
    }).Iterator?.from;

    if (!iteratorFrom) {
      return filtered.toSorted((left, right) => left.name.localeCompare(right.name));
    }

    return iteratorFrom(filtered)
      .filter((plugin) => plugin.scope.length > 0)
      .map((plugin) => plugin)
      .toArray()
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public register<TPlugin extends AnyPolicyPlugin>(plugin: TPlugin): PluginHandle<TPlugin> {
    const catalog = this.catalog;
    const byName = this.byName;
    const scopeSet = this.scope;
    this.catalog.set(plugin.pluginId, plugin);
    this.byName.set(plugin.name, plugin.pluginId);
    this.scope.add(plugin.scope);

    return {
      pluginId: plugin.pluginId,
      name: plugin.name,
      plugin,
      [Symbol.dispose]() {
        catalog.delete(plugin.pluginId);
        byName.delete(plugin.name);
        scopeSet.delete(plugin.scope);
      },
    };
  }

  public remove(name: string): boolean {
    const pluginId = this.byName.get(name);
    if (!pluginId) return false;

    const plugin = this.catalog.get(pluginId);
    if (!plugin) return false;

    this.catalog.delete(pluginId);
    this.byName.delete(name);
    this.scope.delete(plugin.scope);
    return true;
  }

  public record<TInput, TOutput>(pluginId: PolicyPluginId, input: TInput, output: TOutput): void {
    this.runLog.push({ pluginId, input, output });
  }

  public async execute<TSeed extends object>(
    plugins: readonly AnyPolicyPlugin[],
    seed: NoInfer<TSeed>,
    context: PolicyPluginContext,
  ): Promise<TSeed> {
    let current: unknown = seed;
    for (const plugin of plugins) {
      const output = await plugin.run(current as never, context);
      this.record(plugin.pluginId, current, output);
      current = output;
    }
    return current as TSeed;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.catalog.clear();
    this.byName.clear();
    this.scope.clear();
    this.runLog.length = 0;
  }
}

export const routeForPlugin = (route: PolicyRoute): TemplateUnion<readonly ['policy', PolicyPluginNamespace, string]> => {
  const parts = route.split('.');
  return `${parts[0]}.${parts[1] ?? 'planner'}.${parts[2] ?? 'default'}` as TemplateUnion<
    readonly ['policy', PolicyPluginNamespace, string]
  >;
};

export const pluginRouteMap = <T extends Record<string, unknown>>(input: T): PluginRouteMap<T> => {
  const routes = Object.fromEntries(
    Object.keys(input).map((entry): [string, string] => [`route:${entry}`, String(entry)]),
  ) as PluginRouteMap<T>;

  return routes;
};

export const mergePluginOutputs = <T extends readonly PluginRunResult<unknown, unknown>[]>(
  results: T,
): Record<string, number> =>
  results.reduce<Record<string, number>>((acc, item) => {
    acc[item.pluginId] = (acc[item.pluginId] ?? 0) + 1;
    return acc;
  }, {});

export const pluginRouteDepth = <TRecord extends Record<string, unknown>>(input: TRecord): readonly (keyof TRecord)[] => {
  const keys = Object.keys(input) as Array<keyof TRecord>;
  return keys;
};

export const expandRecursivePath = <T>(value: T): string[] => {
  const keys = new Set<RecursivePath<T> extends string ? RecursivePath<T> : never>();
  for (const key of Object.keys(value as Record<string, unknown>) as Array<RecursivePath<T> & string>) {
    keys.add(key);
  }
  return [...keys];
};

