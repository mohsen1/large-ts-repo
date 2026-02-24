import { NoInfer, Prettify } from '@shared/type-level';
import type { AnySignalEnvelope, SignalLayer, SignalRunId } from './signal-models';

export const pluginScopes = ['ingest', 'normalize', 'score', 'forecast', 'route', 'actuate', 'observe'] as const;
export type PluginScope = (typeof pluginScopes)[number];

export type PluginChannel<TScope extends PluginScope = PluginScope> = `${TScope}::${string}`;
export type PluginExecutionFingerprint<TKind extends PluginScope> = `plugin:${TKind}`;

export interface PluginExecutionContext {
  readonly runId: SignalRunId;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly actor: string;
  readonly triggeredAt: string;
  readonly tags: Readonly<Record<string, string>>;
}

export interface PluginResult<TOutput = unknown> {
  readonly accepted: boolean;
  readonly output: TOutput;
  readonly warnings: readonly string[];
  readonly latencyMs: number;
  readonly executedAt: string;
}

export interface CockpitPluginManifest<
  TName extends string = string,
  TScope extends PluginScope = PluginScope,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly id: `plugin:${TName}`;
  readonly scope: TScope;
  readonly name: TName;
  readonly channels: readonly PluginChannel<TScope>[];
  readonly enabled: boolean;
  readonly layers: readonly SignalLayer[];
  readonly metadata: Readonly<Record<string, string>>;
  execute(input: NoInfer<TInput>, context: NoInfer<PluginExecutionContext>): Promise<PluginResult<TOutput>>;
}

export type PluginResultEnvelope<TInput extends readonly CockpitPluginManifest[]> = {
  [Plugin in TInput[number] as Plugin['id']]: Awaited<
    ReturnType<Plugin['execute']>
  >;
};

export type PluginByScope<
  TInput extends readonly CockpitPluginManifest[],
  TScope extends PluginScope,
> = Extract<TInput[number], { scope: TScope }>;

export type ManifestIndex<TInput extends readonly CockpitPluginManifest[]> = {
  [Entry in TInput[number] as Entry['id']]: Entry;
};

export interface PluginExecutionRecord {
  readonly pluginId: string;
  readonly scope: PluginScope;
  readonly accepted: boolean;
  readonly warnings: readonly string[];
  readonly latencyMs: number;
  readonly ranAt: string;
}

export interface PluginRegistrySnapshot<TInput extends readonly CockpitPluginManifest[]> {
  readonly total: number;
  readonly enabled: number;
  readonly disabled: number;
  readonly byScope: {
    [K in PluginScope]: readonly TInput[number][];
  };
  readonly manifests: readonly TInput[number][];
  readonly recent: readonly PluginExecutionRecord[];
}

type AsyncDisposer = {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

type StackCtor = new () => AsyncDisposer;
const createDisposer = (): AsyncDisposer => {
  const Ctor = (globalThis as unknown as { AsyncDisposableStack?: StackCtor }).AsyncDisposableStack;
  if (Ctor) {
    return new Ctor();
  }
  return {
    [Symbol.dispose]: () => {},
    [Symbol.asyncDispose]: async () => {},
  };
};

export class CockpitPluginRegistry<const TInput extends readonly CockpitPluginManifest[] = []> {
  #entries = new Map<string, TInput[number]>();
  #recent: PluginExecutionRecord[] = [];
  #stack: AsyncDisposer = createDisposer();
  #disposed = false;

  public constructor(
    entries: TInput = [] as unknown as TInput,
    private readonly maxHistory = 64,
  ) {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  public register<TName extends string, TScope extends PluginScope, TIn, TOut>(
    manifest: CockpitPluginManifest<TName, TScope, TIn, TOut>,
    options: { overwrite?: boolean } = {},
  ): void {
    if (this.#disposed) return;
    if (this.#entries.has(manifest.id) && options.overwrite !== true) {
      return;
    }

    this.#entries.set(manifest.id, manifest as unknown as TInput[number]);
  }

  public has(id: string): boolean {
    return this.#entries.has(id);
  }

  public list(): readonly TInput[number][] {
    return [...this.#entries.values()];
  }

  public get<TId extends string>(id: TId): ManifestIndex<TInput>[Extract<TId, keyof ManifestIndex<TInput>>] | undefined {
    return this.#entries.get(String(id)) as ManifestIndex<TInput>[Extract<TId, keyof ManifestIndex<TInput>>] | undefined;
  }

  public byScope<TScope extends PluginScope>(scope: TScope): readonly TInput[number][] {
    const entries = [...this.#entries.values()];
    const matches: TInput[number][] = [];
    for (const plugin of entries) {
      if (plugin.scope === scope) {
        matches.push(plugin as TInput[number]);
      }
    }
    return matches;
  }

  public listByLayer(layer: SignalLayer): readonly TInput[number][] {
    return [...this.#entries.values()].filter((plugin) => plugin.layers.includes(layer));
  }

  public async execute<TIn, TOut>(
    id: keyof ManifestIndex<TInput>,
    input: NoInfer<TIn>,
    context: NoInfer<PluginExecutionContext>,
  ): Promise<PluginResult<TOut> | null> {
    const plugin = this.#entries.get(String(id));
    if (!plugin || !plugin.enabled) {
      return null;
    }

    const start = performance.now();
    const result = await plugin.execute(input, context);
    const latencyMs = performance.now() - start;
    this.recordExecution(plugin, result.warnings, latencyMs);
    return result as PluginResult<TOut>;
  }

  public async executeByScope<TIn, TOut, TScope extends PluginScope>(
    scope: TScope,
    input: NoInfer<TIn>,
    context: NoInfer<PluginExecutionContext>,
  ): Promise<readonly PluginResult<TOut>[]> {
    const ordered = this.byScope(scope).toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );
    const outputs: PluginResult<TOut>[] = [];
    for (const plugin of ordered) {
      const ran = await this.execute<TIn, TOut>(plugin.id, input, context);
      if (ran) {
        outputs.push(ran);
      }
    }
    return outputs;
  }

  public snapshot(): PluginResultEnvelope<TInput> {
    const byScope = pluginScopes.reduce(
      (acc, scope) => {
        acc[scope] = this.byScope(scope);
        return acc;
      },
      {} as {
        [K in PluginScope]: readonly TInput[number][];
      },
    );

    const recent = [...this.#recent]
      .toSorted((left, right) => left.ranAt.localeCompare(right.ranAt))
      .slice(-this.maxHistory);
    return {
      total: this.#entries.size,
      enabled: [...this.#entries.values()].filter((plugin) => plugin.enabled).length,
      disabled: [...this.#entries.values()].filter((plugin) => !plugin.enabled).length,
      byScope,
      manifests: [...this.#entries.values()],
      recent,
    } as unknown as PluginResultEnvelope<TInput>;
  }

  public unregister(id: keyof ManifestIndex<TInput>): boolean {
    return this.#entries.delete(String(id));
  }

  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#entries.clear();
    this.#recent.length = 0;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#entries.clear();
    this.#recent.length = 0;
    await this.#stack[Symbol.asyncDispose]();
  }

  private recordExecution(plugin: TInput[number], warnings: readonly string[], latencyMs: number): void {
    this.#recent.push({
      pluginId: plugin.id,
      scope: plugin.scope,
      accepted: warnings.length === 0,
      warnings,
      latencyMs,
      ranAt: new Date().toISOString(),
    });
    if (this.#recent.length > this.maxHistory) {
      this.#recent = this.#recent.slice(-this.maxHistory);
    }
  }
}

export const createCatalogSignature = <TInput extends readonly CockpitPluginManifest[]>(
  manifests: TInput,
): PluginResultEnvelope<TInput> => {
  const registry = new CockpitPluginRegistry<TInput>(manifests, 16);
  return registry.snapshot();
};

export const resolveLayerForSignal = (signal: AnySignalEnvelope): SignalLayer => signal.layer;

export const ensureLayerCatalog = (signal: AnySignalEnvelope): Prettify<{ layer: SignalLayer; kind: string }> => ({
  layer: resolveLayerForSignal(signal),
  kind: signal.kind,
});
