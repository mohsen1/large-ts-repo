import { Brand, NodeId, withBrand } from '@shared/core';
import { StreamHealthSignal, StreamSlaWindow, StreamSnapshot, StreamTopologyAlert, StreamTenantId } from './types';
import { NoInfer } from '@shared/type-level';

export type PluginNamespace = 'ingest' | 'topology' | 'sla' | 'actuator' | 'policy';
export type StreamingPluginKind = `${PluginNamespace}-plugin`;
export type PluginScope = `${StreamingPluginKind}:${string}`;
export type PluginRoute = `streaming.${PluginNamespace}.${string}`;

export type PluginId = Brand<string, 'StreamingPluginId'>;
export type PluginVersion = Brand<string, 'StreamingPluginVersion'>;
export type PluginTraceId = Brand<string, 'StreamingPluginTraceId'>;

export interface PluginSeverityState {
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly level: 'ok' | 'warn' | 'critical';
}

export interface StreamingPluginContext {
  readonly tenant: StreamTenantId;
  readonly streamId: string;
  readonly traceId: PluginTraceId;
  readonly scope: PluginScope;
  readonly startedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StreamingPluginManifest<
  TName extends string = string,
  TKind extends StreamingPluginKind = StreamingPluginKind,
> {
  readonly pluginId: PluginId;
  readonly kind: TKind;
  readonly name: TName;
  readonly version: PluginVersion;
  readonly scope: `${TKind}:${TName}`;
}

export interface StreamingPlugin<
  TName extends string = string,
  TKind extends StreamingPluginKind = StreamingPluginKind,
  TInput = unknown,
  TOutput = unknown,
  TConsumes extends readonly string[] = readonly [],
  TEmits extends readonly string[] = readonly [],
> extends StreamingPluginManifest<TName, TKind> {
  readonly consumes: TConsumes;
  readonly emits: TEmits;
  run(input: TInput, context: StreamingPluginContext): Promise<TOutput>;
}

export type AnyStreamingPlugin = StreamingPlugin<any, any, any, any, readonly string[], readonly string[]>;

export type PluginOutput<T extends AnyStreamingPlugin> = T extends StreamingPlugin<any, any, any, infer TOutput, any, any> ? TOutput : never;
export type PluginInput<T extends AnyStreamingPlugin> = T extends StreamingPlugin<any, any, infer TInput, any, any, any> ? TInput : never;

export type TemplateUnion<T extends readonly string[]> = T extends readonly [infer H extends string, ...infer Rest extends readonly string[]]
  ? Rest extends []
    ? `${H}`
    : `${H}/${TemplateUnion<Rest>}`
  : never;

export type RemapPluginOutputs<TCatalog extends readonly AnyStreamingPlugin[]> = {
  [Plugin in TCatalog[number] as `plugin:${Plugin['kind']}:${Plugin['name']}`]: PluginOutput<Plugin>;
};

export type RecursivePluginTuple<T extends readonly any[]> = T extends readonly [infer H, ...infer R extends readonly any[]]
  ? [H, ...RecursivePluginTuple<R>]
  : [];

export type FoldPluginChain<TChain extends readonly AnyStreamingPlugin[], TSeed> =
  TChain extends readonly [infer Head extends AnyStreamingPlugin, ...infer Tail extends readonly AnyStreamingPlugin[]]
    ? Tail extends readonly AnyStreamingPlugin[]
      ? FoldPluginChain<Tail, PluginOutput<Head>>
      : PluginOutput<Head>
    : TSeed;

export interface PluginHandle<TPlugin extends AnyStreamingPlugin> extends Disposable {
  readonly pluginId: PluginId;
  readonly name: TPlugin['name'];
  readonly plugin: TPlugin;
}

export interface PluginRegistryState<TCatalog extends readonly AnyStreamingPlugin[]> {
  readonly plugins: TCatalog;
  readonly total: number;
  readonly pluginIds: readonly PluginId[];
}

export interface PluginRunResult<TInput, TOutput> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly pluginId: PluginId;
}

const PLUGIN_KEY_PREFIX = 'streaming.plugin.' as const;
const pluginTraceCounter = { value: 0 };

export const pluginId = (value: string): PluginId => withBrand(`${PLUGIN_KEY_PREFIX}${value}`, 'StreamingPluginId');
export const pluginVersion = (value: string): PluginVersion => withBrand(value, 'StreamingPluginVersion');

export const pluginTrace = (streamId: string): PluginTraceId => {
  pluginTraceCounter.value += 1;
  return withBrand(`${streamId}::trace-${pluginTraceCounter.value}`, 'StreamingPluginTraceId');
};

export const createPluginManifest = <
  const TName extends string,
  const TKind extends StreamingPluginKind,
>(
  name: TName,
  kind: TKind,
  version: string,
): StreamingPluginManifest<TName, TKind> => ({
  pluginId: pluginId(`${name}:${kind}`),
  kind,
  name,
  version: pluginVersion(version),
  scope: `${kind}:${name}`,
});

export interface PluginFilter {
  readonly kind?: StreamingPluginKind;
  readonly names?: readonly string[];
  readonly scopes?: readonly PluginScope[];
}

export const matchesFilter = (manifest: StreamingPluginManifest, filter: PluginFilter): boolean => {
  if (filter.kind && manifest.kind !== filter.kind) return false;
  if (filter.names?.length && !filter.names.includes(manifest.name)) return false;
  if (filter.scopes?.length && !filter.scopes.includes(manifest.scope)) return false;
  return true;
};

export class StreamingPluginRegistry<TCatalog extends readonly AnyStreamingPlugin[]> implements AsyncDisposable {
  private readonly catalog = new Map<PluginId, AnyStreamingPlugin>();
  private readonly byName = new Map<string, PluginId>();
  private readonly scope = new Set<string>();
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
    return {
      plugins,
      total: pluginIds.length,
      pluginIds,
    };
  }

  public get pluginNames(): readonly string[] {
    return [...this.byName.keys()];
  }

  public findByName<TName extends string>(
    name: TName,
  ): Extract<TCatalog[number], { name: TName }> | undefined {
    const key = this.byName.get(name);
    if (!key) return undefined;
    return this.catalog.get(key) as Extract<TCatalog[number], { name: TName }> | undefined;
  }

  public list(filter: PluginFilter = {}): readonly AnyStreamingPlugin[] {
    const base = [...this.catalog.values()] as readonly AnyStreamingPlugin[];
    const filtered = base.filter(
      (plugin: AnyStreamingPlugin): plugin is AnyStreamingPlugin =>
        matchesFilter(plugin as StreamingPluginManifest, filter),
    );

    type IteratorChain<T> = IterableIterator<T> & {
      map<U>(transform: (value: T) => U): IteratorChain<U> & { toArray(): U[] };
      filter(condition: (value: T) => boolean): IteratorChain<T> & { toArray(): T[] };
      toArray(): T[];
    };

    const iteratorFrom = (globalThis as {
      Iterator?: {
        from?: <T>(value: Iterable<T>) => IteratorChain<T>;
      };
    }).Iterator?.from;

    if (!iteratorFrom) {
      return [...filtered].sort((left, right) => left.name.localeCompare(right.name));
    }

    return iteratorFrom(filtered)
      .filter((plugin) => plugin.kind !== 'actuator-plugin')
      .toArray()
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public register<TPlugin extends AnyStreamingPlugin>(plugin: TPlugin): PluginHandle<TPlugin> {
    const catalog = this.catalog;
    const byName = this.byName;
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
      },
    };
  }

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    this.closed = true;
    this.catalog.clear();
    this.byName.clear();
    this.scope.clear();
    return Promise.resolve();
  }
}

export async function executePluginChain<
  const TChain extends readonly AnyStreamingPlugin[],
  TSeed,
>(
  chain: TChain,
  seed: NoInfer<TSeed>,
  context: StreamingPluginContext,
): Promise<FoldPluginChain<TChain, TSeed>> {
  let current: unknown = seed;
  const resultLog: PluginRunResult<unknown, unknown>[] = [];

  for (const plugin of chain) {
    const next = await plugin.run(current as never, context);
    resultLog.push({ input: current, output: next, pluginId: plugin.pluginId });
    current = next;
  }

  return current as FoldPluginChain<TChain, TSeed>;
}

export const buildTopologyDigest = (alerts: readonly StreamTopologyAlert[]): string => {
  const entries = alerts
    .map((alert) => `${alert.nodeId}:${alert.code}:${alert.severity}`)
    .sort((left, right) => left.localeCompare(right));
  return entries.join('|');
};

export const summarizeTopologyHealth = (alerts: readonly StreamTopologyAlert[]): PluginSeverityState => {
  const maxSeverity = Math.max(...alerts.map((alert) => alert.severity), 1);
  const critical = alerts.filter((alert) => alert.severity >= 4).length;
  const warning = alerts.filter((alert) => alert.severity === 3).length;
  const score = maxSeverity as PluginSeverityState['severity'];
  return {
    severity: score,
    level: critical > 0 ? 'critical' : warning > 0 ? 'warn' : 'ok',
  };
};

export const computeSignalAverages = (snapshot: StreamSnapshot, windowMs: number): StreamSlaWindow => {
  const eventSample = windowMs > 0 ? snapshot.signals.length / windowMs : 0;
  const normalized = Number((Math.min(1, eventSample / 10)).toFixed(3));
  return {
    windowId: withBrand(`${snapshot.streamId}::${windowMs}`, 'WindowId'),
    window: { start: Date.now() - windowMs, end: Date.now() },
    targetMs: 120,
    actualMs: 100,
    violated: normalized > 0.75,
  };
};
