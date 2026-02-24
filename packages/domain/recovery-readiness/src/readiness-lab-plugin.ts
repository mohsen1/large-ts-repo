import type { NoInfer } from '@shared/type-level';
import type {
  ReadinessLabChannel,
  ReadinessLabExecutionInput,
  ReadinessLabExecutionOutput,
  ReadinessLabStep,
} from './readiness-lab-core';

export interface ReadinessLabPluginMetadata {
  readonly pluginId: string;
  readonly displayName: string;
  readonly version: string;
  readonly supportedChannels: ReadonlyArray<ReadinessLabChannel>;
  readonly requires?: ReadonlyArray<string>;
}

export interface ReadinessLabPlugin<
  TKind extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TTag extends string = string,
> {
  readonly kind: TKind;
  readonly tag: TTag;
  readonly step: ReadinessLabStep;
  readonly metadata: ReadinessLabPluginMetadata;
  execute(input: NoInfer<TInput>, context: { signal: AbortSignal }): Promise<TOutput>;
}

export type ReadinessLabPluginByKind<
  TPlugins extends readonly ReadinessLabPlugin[],
  TKind extends string,
> = TPlugins[number] extends infer TPlugin
  ? TPlugin extends ReadinessLabPlugin<TKind, infer _Input, infer _Output, infer _Tag>
    ? TPlugin
    : never
  : never;

export type ReadinessLabPluginResultMap<
  TPlugins extends readonly ReadinessLabPlugin[],
> = {
  [K in TPlugins[number] as K['kind']]: K extends ReadinessLabPlugin<
    K['kind'],
    infer TInput,
    infer TOutput,
    infer TTag
  >
    ? {
        readonly kind: K['kind'];
        readonly tag: TTag;
        readonly input: TInput;
        readonly output: TOutput;
      }
    : never;
};

export interface ReadinessLabPluginDiagnostics {
  readonly pluginId: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly warnings: readonly string[];
}

export interface ReadinessLabPluginHandle<TPlugin extends ReadinessLabPlugin = ReadinessLabPlugin> {
  readonly plugin: TPlugin;
  readonly dispose: () => Promise<void>;
  readonly diagnostics: () => ReadonlyArray<ReadinessLabPluginDiagnostics>;
}

const nowIso = (): string => new Date().toISOString();

export const pluginHandle = <TPlugin extends ReadinessLabPlugin>(plugin: TPlugin): ReadinessLabPluginHandle<TPlugin> => {
  const diagnostics: ReadinessLabPluginDiagnostics[] = [];

  return {
    plugin,
    diagnostics: () => diagnostics,
    dispose: async () => {
      diagnostics.push({
        pluginId: plugin.metadata.pluginId,
        startedAt: nowIso(),
        durationMs: 0,
        warnings: ['disposed'],
      });
    },
  };
};

export class ReadinessLabPluginCatalog<TPlugins extends readonly ReadinessLabPlugin[]> implements AsyncDisposable {
  readonly #registry: Map<string, ReadinessLabPlugin>;
  readonly #handles = new Map<string, ReadinessLabPluginHandle>();
  readonly #handlesByKind = new Map<string, ReadinessLabPluginHandle>();
  readonly #closed = { value: false };
  readonly #inserted: number;

  constructor(plugins: TPlugins) {
    const entries = [...plugins].map((entry) => [entry.metadata.pluginId, entry] as const);
    this.#registry = new Map(entries);
    this.#inserted = entries.length;

    for (const entry of entries) {
      const handle = pluginHandle(entry[1]);
      this.#handles.set(entry[0], handle);
      this.#handlesByKind.set(entry[1].kind, handle);
    }
  }

  get size(): number {
    return this.#inserted;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed.value = true;
    return Promise.all([...this.#handles.values()].map((handle) => handle.dispose())).then(() => undefined);
  }

  [Symbol.dispose](): void {
    this.#closed.value = true;
    this.#handles.clear();
    this.#handlesByKind.clear();
    this.#registry.clear();
  }

  getPlugin<TKind extends string>(kind: TKind): ReadinessLabPlugin | undefined {
    const handle = this.#handlesByKind.get(kind);
    if (!handle) {
      return undefined;
    }

    return handle.plugin as ReadinessLabPlugin;
  }

  snapshot(): readonly TPlugins[number][] {
    return [...this.#handles.values()].map((entry) => entry.plugin as TPlugins[number]);
  }

  get manifestPaths(): ReadonlyMap<string, ReadonlyArray<string>> {
    const map = new Map<string, ReadinessLabPluginMetadata['pluginId'][]>();
    for (const plugin of this.#registry.values()) {
      map.set(plugin.kind as string, [plugin.metadata.pluginId, ...(map.get(plugin.kind as string) ?? [])]);
    }

    return map;
  }

  async run<TOutput>(kind: string, input: ReadinessLabExecutionInput): Promise<TOutput> {
    const plugin = this.getPlugin(kind);
    if (!plugin) {
      throw new Error(`plugin-missing:${String(kind)}`);
    }

    const started = Date.now();
    const output = await (plugin.execute as (input: NoInfer<ReadinessLabExecutionInput>, ctx: { signal: AbortSignal }) => Promise<TOutput>)(
      input,
      { signal: new AbortController().signal },
    );
    const previous = this.#handles.get(plugin.metadata.pluginId);
    if (previous) {
      this.#handles.set(plugin.metadata.pluginId, {
        ...previous,
        diagnostics: () => [
          {
            pluginId: plugin.metadata.pluginId,
            startedAt: nowIso(),
            durationMs: Date.now() - started,
            warnings: [],
          },
          ...previous.diagnostics(),
        ],
      });
      this.#handlesByKind.set(plugin.kind as string, this.#handles.get(plugin.metadata.pluginId)!);
    }

    return output;
  }

  runSequential(
    context: ReadinessLabExecutionInput,
    pluginKindOrder: readonly string[],
  ): Promise<readonly ReadinessLabExecutionOutput[]> {
    return pluginKindOrder.reduce<Promise<readonly ReadinessLabExecutionOutput[]>>(
      async (acc, nextKind) => {
        const prior = [...(await acc)];
        const nextOutput = await this.run<ReadinessLabExecutionOutput>(nextKind, context);
        return [...prior, nextOutput];
      },
      Promise.resolve([] as const),
    );
  }

  hasClosed(): boolean {
    return this.#closed.value;
  }
}

export type ReadinessLabPluginTuple<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail extends string[]]
  ? readonly [Head, ...ReadinessLabPluginTuple<Tail>]
  : readonly [];

export const buildPluginOrder = <TKind extends readonly string[]>(values: TKind): ReadinessLabPluginTuple<TKind> =>
  values as unknown as ReadinessLabPluginTuple<TKind>;
