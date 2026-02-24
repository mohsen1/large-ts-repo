import { type NoInfer } from '@shared/type-level';
import {
  type PluginContextState,
  type PluginResult,
  type RecoverySignal,
  type RecoverySignalId,
  type StageSignal,
  type StressLabPluginId,
  createSignalId,
  type TenantId,
  type StressPhase,
} from './models';

export interface PluginManifestShape<TPluginId extends string = string, TKind extends string = string> {
  readonly pluginId: TPluginId;
  readonly tenantId: TenantId;
  readonly kind: TKind;
  readonly phase: StressPhase;
  readonly labels: readonly string[];
}

export interface StressLabPlugin<TInput = unknown, TOutput = unknown, TContext extends PluginContextState = PluginContextState, TKind extends string = string>
  extends PluginManifestShape<StressLabPluginId, TKind> {
  readonly runbook: readonly StressPhase[];
  readonly config: Readonly<Record<string, unknown>>;
  run(input: NoInfer<TInput>, context: NoInfer<TContext>): Promise<PluginResult<TOutput>>;
}

export type PluginCatalogKind<TCatalog extends readonly StressLabPlugin[]> = TCatalog[number]['kind'];

export type PluginCatalogMap<TCatalog extends readonly StressLabPlugin[]> = {
  readonly [K in PluginCatalogKind<TCatalog>]: readonly Extract<TCatalog[number], { readonly kind: K }>[];
};

export type PluginInputOf<TCatalog extends readonly StressLabPlugin[], TKind extends PluginCatalogKind<TCatalog>> =
  Extract<TCatalog[number], { readonly kind: TKind }> extends StressLabPlugin<infer TInput, any, any, any> ? TInput : never;

export type PluginOutputOf<TCatalog extends readonly StressLabPlugin[], TKind extends PluginCatalogKind<TCatalog>> =
  Extract<TCatalog[number], { readonly kind: TKind }> extends StressLabPlugin<any, infer TOutput, any, any>
    ? TOutput
    : never;

export interface RegistryEvent {
  readonly tenantId: TenantId;
  readonly pluginId: StressLabPluginId;
  readonly kind: PluginCatalogKind<readonly StressLabPlugin[]>;
  readonly at: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
}

class RegistryScope implements Disposable, AsyncDisposable {
  #disposed = false;

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }
    this.#disposed = true;
    return Promise.resolve();
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
  }
}

const iteratorFrom =
  (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { map<U>(transform: (value: T) => U): { toArray(): U[] }; toArray(): T[] } } }).Iterator?.from;

const formatSeverity = (signal: RecoverySignal | StageSignal): string => {
  const signalId = 'signal' in signal ? signal.signal : signal.id;
  return `${signalId}:${signal.severity}`;
};

export class StressLabPluginRegistry<TCatalog extends readonly StressLabPlugin[]>
  implements AsyncDisposable, Disposable {
  readonly #catalog: TCatalog;
  readonly #tenantId: TenantId;
  readonly #byKind = new Map<PluginCatalogKind<TCatalog>, StressLabPlugin[]>();
  readonly #events: RegistryEvent[] = [];
  #disposed = false;

  public constructor(tenantId: TenantId, catalog: NoInfer<TCatalog>) {
    this.#tenantId = tenantId;
    this.#catalog = catalog;
    this.#index(catalog);
  }

  public register<TPlugin extends TCatalog[number]>(plugin: TPlugin): TPlugin {
    const bucket = this.#byKind.get(plugin.kind) ?? [];
    this.#byKind.set(plugin.kind, [...bucket, plugin]);
    this.#events.push({
      tenantId: this.#tenantId,
      pluginId: plugin.pluginId,
      kind: plugin.kind,
      at: new Date().toISOString(),
      status: 'queued',
    });
    return plugin;
  }

  public manifest(): PluginCatalogMap<TCatalog> {
    const raw = [...this.#byKind.entries()];
    const entries = iteratorFrom?.(raw)
      ? iteratorFrom(raw)
          .map(([kind, list]) =>
            [
              kind,
              list.map((plugin) => plugin.pluginId),
            ] as const,
          )
          .toArray()
      : raw.map(([kind, list]) => [kind, list.map((plugin) => plugin.pluginId)] as const);

    const map: Record<string, readonly StressLabPluginId[]> = Object.fromEntries(entries);
    return map as unknown as PluginCatalogMap<TCatalog>;
  }

  public async run<TKind extends PluginCatalogKind<TCatalog>>(
    kind: NoInfer<TKind>,
    input: NoInfer<PluginInputOf<TCatalog, TKind>>,
    context: PluginContextState,
    requestId: string,
  ): Promise<PluginOutputOf<TCatalog, TKind>> {
    const candidates = this.#byKind.get(kind as PluginCatalogKind<TCatalog>) ?? [];
    if (candidates.length === 0) {
      throw new Error(`No plugin registered for kind ${String(kind)} in request ${requestId}`);
    }

    const scope = new AsyncDisposableStack();
    try {
      const candidate = candidates[0];
      await using _scope = scope.use(new RegistryScope());

      this.#events.push({
        tenantId: this.#tenantId,
        pluginId: candidate.pluginId,
        kind,
        at: new Date().toISOString(),
        status: 'running',
      });

      const result = await candidate.run(input as never, context as never);
      if (!result.ok) {
        this.#events.push({
          tenantId: this.#tenantId,
          pluginId: candidate.pluginId,
          kind,
          at: new Date().toISOString(),
          status: 'failed',
        });
        throw new Error(result.error?.message ?? `plugin ${candidate.pluginId} failed`);
      }

      this.#events.push({
        tenantId: this.#tenantId,
        pluginId: candidate.pluginId,
        kind,
        at: new Date().toISOString(),
        status: 'completed',
      });

      return result.value as PluginOutputOf<TCatalog, TKind>;
    } finally {
      await scope.disposeAsync();
    }
  }

  public replaySignals(signals: readonly RecoverySignal[]): { readonly digest: string; readonly ids: readonly RecoverySignalId[] } {
    const iterator = iteratorFrom?.(signals)
      ? iteratorFrom(signals).map((signal) => formatSeverity(signal)).toArray()
      : signals.map((signal) => formatSeverity(signal));

    const id = this.#events
      .filter((event) => event.tenantId === this.#tenantId)
      .map((event) => createSignalId(`${event.pluginId}:${event.kind}:${event.at}`));

    return {
      digest: iterator.join('|') || 'empty',
      ids: id,
    };
  }

  public telemetry(kind?: PluginCatalogKind<TCatalog>): readonly RegistryEvent[] {
    return kind ? this.#events.filter((event) => event.kind === kind) : [...this.#events];
  }

  #index(catalog: TCatalog): void {
    const iterator = iteratorFrom?.(catalog)
      ? iteratorFrom(catalog)
          .map((plugin) => [plugin.kind, plugin] as const)
          .toArray()
      : catalog.map((plugin) => [plugin.kind, plugin] as const);

    for (const [kind, plugin] of iterator) {
      const current = this.#byKind.get(kind as PluginCatalogKind<TCatalog>) ?? [];
      this.#byKind.set(kind as PluginCatalogKind<TCatalog>, [...current, plugin]);
    }
  }

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#disposed = true;
    this.#byKind.clear();
    this.#events.length = 0;
    return Promise.resolve();
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
    this.#byKind.clear();
    this.#events.length = 0;
  }
}

export const buildCatalog = <TCatalog extends readonly StressLabPlugin[]>(
  tenantId: TenantId,
  plugins: NoInfer<TCatalog>,
): StressLabPluginRegistry<TCatalog> => {
  return new StressLabPluginRegistry(tenantId, plugins);
};
