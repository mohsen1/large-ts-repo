import { asSignalAlias, type AnalyticsSignalPayload } from './models';
import { type NoInfer } from '@shared/type-level';
import type { AnalyticsRun, SignalNamespace } from './identifiers';

export type PluginName<T extends string = string> = `plugin:${T}`;
export type SignalEventName<TSignal extends string = string> = `signal:${TSignal}`;

type AsyncSymbol = AsyncDisposable & { [Symbol.asyncDispose](): PromiseLike<void> };

const hasAsyncDispose = (value: unknown): value is AsyncSymbol => {
  return value !== null && typeof value === 'object' && Symbol.asyncDispose in (value as object);
};

export type PluginContext = {
  readonly tenant: `tenant:${string}`;
  readonly runId: AnalyticsRun;
  readonly namespace: SignalNamespace;
};

export type PluginResult<TPayload = unknown> = Readonly<{
  readonly plugin: PluginName;
  readonly ok: boolean;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly payload: TPayload;
  readonly diagnostics: readonly string[];
}>;

export type SignalPlugin<TSignal extends string = string, TOutput = unknown> = Readonly<{
  readonly name: PluginName<TSignal>;
  readonly dependsOn: readonly PluginName[];
  readonly inputKinds: readonly SignalEventName<TSignal>[];
  readonly run: (
    input: AnalyticsSignalPayload<string>,
    context: PluginContext,
  ) => Promise<PluginResult<TOutput>>;
}>;

export type RegistryEntry<TSignal extends string = string, TOutput = unknown> = Readonly<{
  readonly key: PluginName<TSignal>;
  readonly handler: SignalPlugin<TSignal, TOutput>;
  readonly enabled: boolean;
  readonly metadata?: Readonly<{
    readonly alias: ReturnType<typeof asSignalAlias<TSignal>>;
    readonly tags: readonly string[];
    readonly output?: unknown;
  }>;
}>;

export type RegistryMap<TRegistry extends Record<string, RegistryEntry>> = {
  [TKey in keyof TRegistry & string as `reg:${TKey}`]: TRegistry[TKey];
};

export type PluginLookup<TRegistry extends Record<string, RegistryEntry>> = {
  [TName in keyof TRegistry]: TRegistry[TName]['handler'];
};

export type RegistryWith<TRegistry extends Record<string, RegistryEntry>, TName extends string> = Omit<
  TRegistry,
  TName
> & Record<TName, RegistryEntry>;

export type RegistryInput<TRegistry extends Record<string, RegistryEntry>, TName extends string, TOutput> = {
  readonly key: PluginName<TName>;
  readonly handler: SignalPlugin<TName, TOutput>;
  readonly enabled?: boolean;
  readonly metadata?: Readonly<{
    readonly alias?: ReturnType<typeof asSignalAlias<TName>>;
    readonly tags?: readonly string[];
    readonly output?: unknown;
  }>;
};

const asAsyncDisposable = (value: AsyncDisposable): AsyncDisposable =>
  value;

export class AnalyticsPluginRegistry<TRegistry extends Record<string, RegistryEntry> = {}> {
  readonly #entries = new Map<string, RegistryEntry>();
  readonly #disposables = new AsyncDisposableStack();
  #closed = false;

  register<TName extends string, TOutput>(
    entry: NoInfer<RegistryInput<TRegistry, TName, TOutput>>,
  ): AnalyticsPluginRegistry<RegistryWith<TRegistry, PluginName<TName>>> {
    if (this.#closed) {
      throw new Error('registry is closed');
    }
    if (this.#entries.has(entry.key)) {
      throw new Error(`duplicate plugin: ${entry.key}`);
    }
    const next: RegistryEntry = {
      key: entry.key,
      handler: entry.handler,
      enabled: entry.enabled ?? true,
      metadata: {
        alias: entry.metadata?.alias ?? asSignalAlias(`plugin:${entry.key}`),
        tags: entry.metadata?.tags ?? [],
        output: entry.metadata?.output,
      },
    };
    this.#entries.set(next.key, next);
    return this as AnalyticsPluginRegistry<RegistryWith<TRegistry, PluginName<TName>>>;
  }

  remove<TName extends keyof TRegistry & string>(name: TName): boolean {
    if (this.#closed) return false;
    return this.#entries.delete(name);
  }

  has<TName extends keyof TRegistry & string>(name: TName): boolean {
    return this.#entries.has(name);
  }

  get<TName extends keyof TRegistry & string>(name: TName): TRegistry[TName] | undefined {
    return this.#entries.get(name) as TRegistry[TName] | undefined;
  }

  snapshot(): RegistryMap<TRegistry> {
    const out: Record<string, RegistryEntry> = {};
    for (const [name, entry] of this.#entries) {
      out[`reg:${name}`] = entry;
    }
    return out as RegistryMap<TRegistry>;
  }

  entries(): readonly RegistryEntry[] {
    return [...this.#entries.values()];
  }

  collectByDependency(signal: SignalEventName): readonly RegistryEntry[] {
    return this.entries().filter((entry) => entry.handler.dependsOn.includes(signal as PluginName));
  }

  collectByInput<Kinds extends readonly string[]>(kinds: NoInfer<Kinds>): {
    readonly [K in Kinds[number]]: readonly RegistryEntry[];
  } {
    const out: Record<string, readonly RegistryEntry[]> = {};
    for (const kind of kinds) {
      out[kind] = this.entries().filter((entry) => entry.handler.inputKinds.includes(`signal:${kind}` as SignalEventName));
    }
    return out as { readonly [K in Kinds[number]]: readonly RegistryEntry[] };
  }

  [Symbol.dispose](): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#entries.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const items = [...this.#entries.values()];
    this.#entries.clear();
    for (const entry of items) {
      if (hasAsyncDispose(entry)) {
        await asAsyncDisposable(entry as AsyncDisposable)[Symbol.asyncDispose]();
      }
    }
    await this.#disposables.disposeAsync();
  }
}

export const createAnalyticsPluginRegistry = <TEntries extends Record<string, RegistryEntry>>(
  entries: NoInfer<TEntries>,
): AnalyticsPluginRegistry<TEntries> => {
  const registry = new AnalyticsPluginRegistry<TEntries>();
  for (const entry of Object.values(entries)) {
    registry.register(entry as RegistryInput<TEntries, string, unknown>);
  }
  return registry;
};

export const pluginToSummary = <TSignal extends string, TOutput>(
  plugin: SignalPlugin<TSignal, TOutput>,
): Readonly<{
  readonly name: PluginName<TSignal>;
  readonly dependencyCount: number;
  readonly canRun: boolean;
  readonly inputs: readonly SignalEventName<TSignal>[];
  readonly outputs: Readonly<Record<string, TOutput>>;
}> => ({
  name: plugin.name,
  dependencyCount: plugin.dependsOn.length,
  canRun: typeof plugin.run === 'function',
  inputs: plugin.inputKinds,
  outputs: {},
});
