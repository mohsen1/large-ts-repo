import { fail, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import {
  type PluginDiagnostic,
  type PluginDiagnosticBySeverity,
  type PluginId,
  type PluginInput,
  type PluginName,
  type PluginNamespace,
  type PluginRecord,
  type PlaybookCatalogManifest,
  type PlaybookExecutionTrace,
  type PlaybookPluginDefinition,
  STAGE_ORDER_MAP,
  type PluginState,
  type PluginTag,
} from './types';

interface AsyncDisposerLike {
  [Symbol.asyncDispose](): PromiseLike<void>;
}

interface AsyncStackLike {
  use<T extends AsyncDisposerLike>(resource: T): T;
  adopt<T extends AsyncDisposerLike>(resource: T, onFulfill?: () => void): T;
  [Symbol.asyncDispose](): Promise<void>;
}

type RegistryStats = {
  readonly registered: number;
  byStage: { [K in PluginState]: number };
};

type PluginCollection = readonly PlaybookPluginDefinition[];

const createAsyncStack = (): new () => AsyncStackLike => {
  const Ctor = (globalThis as { AsyncDisposableStack?: new () => AsyncStackLike }).AsyncDisposableStack;
  if (typeof Ctor === 'function') {
    return Ctor;
  }

  return class FallbackAsyncDisposableStack implements AsyncStackLike {
    #resources: AsyncDisposerLike[] = [];
    use<T extends AsyncDisposerLike>(resource: T): T {
      this.adopt(resource);
      return resource;
    }
    adopt<T extends AsyncDisposerLike>(resource: T): T {
      this.#resources.push(resource);
      return resource;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#resources.length > 0) {
        const handle = this.#resources.pop();
        if (handle) {
          await handle[Symbol.asyncDispose]();
        }
      }
    }
  };
};

export class PlaybookPluginRegistry<
  TPlugins extends PluginCollection = readonly PlaybookPluginDefinition[],
> implements AsyncDisposable {
  readonly #manifest: PlaybookCatalogManifest | undefined;
  readonly #plugins: Map<PluginTag, PlaybookPluginDefinition>;
  readonly #diagnostics: PluginDiagnostic[] = [];
  readonly #stats: RegistryStats;

  constructor(plugins: TPlugins, manifest?: PlaybookCatalogManifest) {
    this.#manifest = manifest;
    this.#plugins = new Map(plugins.map((plugin) => [plugin.id, plugin]));
    this.#stats = {
      registered: this.#plugins.size,
      byStage: { discover: 0, plan: 0, simulate: 0, execute: 0, verify: 0, finalize: 0 },
    };

    for (const plugin of plugins) {
      this.#stats.byStage[plugin.stage] += 1;
    }
  }

  pluginById<TName extends PluginName, TNamespace extends PluginNamespace>(
    namespace: TNamespace,
    name: TName,
    version?: string,
  ): NoInfer<PlaybookPluginDefinition | undefined> {
    const candidates = [...this.#plugins.values()]
      .filter((plugin) => plugin.namespace === namespace && plugin.name === name)
      .toSorted((left, right) => left.order - right.order);

    if (!version) {
      return candidates.at(-1) as NoInfer<PlaybookPluginDefinition | undefined>;
    }

    return candidates.find((plugin) => plugin.version === version) as NoInfer<PlaybookPluginDefinition | undefined>;
  }

  selectByName<TName extends PluginName>(name: TName, version?: string): PlaybookPluginDefinition[] {
    return [...this.#plugins.values()].filter((plugin) => plugin.name === name && (version ? plugin.version === version : true));
  }

  manifestForNamespace(namespace: PluginNamespace): PlaybookCatalogManifest | undefined {
    if (!this.#manifest) {
      return undefined;
    }
    return this.#manifest.namespace === namespace ? this.#manifest : undefined;
  }

  get namespacedRecords(): PluginRecord<TPlugins> {
    return Object.fromEntries(
      [...this.#plugins.values()].map((plugin) => [`${plugin.namespace}/${plugin.name}` as const, plugin]),
    ) as PluginRecord<TPlugins>;
  }

  get pluginIds(): readonly PluginTag[] {
    return [...this.#plugins.keys()].toSorted((left, right) => left.localeCompare(right));
  }

  get pluginCountByStage(): Record<PluginState, number> {
    return { ...this.#stats.byStage };
  }

  resolveOrder(stages?: ReadonlyArray<PluginState>): readonly PlaybookPluginDefinition[] {
    const stageFilter = stages?.length ? new Set(stages) : undefined;
    return [...this.#plugins.values()]
      .filter((plugin) => (stageFilter ? stageFilter.has(plugin.stage) : true))
      .toSorted((left, right) => STAGE_ORDER_MAP[left.stage] - STAGE_ORDER_MAP[right.stage] || left.order - right.order);
  }

  pluginIdsForNamespace(namespace: PluginNamespace): readonly PluginId<string, string>[] {
    return [...this.#plugins.values()]
      .filter((plugin) => plugin.namespace === namespace)
      .map((plugin) => `${plugin.namespace}/${plugin.name}` as PluginId<string, string>)
      .toSorted();
  }

  pluginInputShape<TPluginId extends PluginTag>(pluginId: TPluginId): PluginInput<PlaybookPluginDefinition>['input'] | undefined {
    const plugin = this.#plugins.get(pluginId);
    return plugin
      ? {
          input: plugin.input as PluginInput<PlaybookPluginDefinition>['input'],
          output: plugin.output as PluginInput<PlaybookPluginDefinition>['output'],
        }
      : undefined;
  }

  async resolve<TIn extends Record<string, unknown>, TOut extends Record<string, unknown>>(
    pluginId: PluginTag,
    input: NoInfer<TIn>,
    context: {
      tenantId: string;
      workspaceId: string;
      runId: string;
    },
  ): Promise<Result<TOut, string>> {
    const plugin = this.#plugins.get(pluginId) ?? this.#plugins.get(`${pluginId}` as PluginTag);
    if (!plugin) {
      return fail(`plugin-not-found:${pluginId}`);
    }

    const started = Date.now();
    try {
      const output = await plugin.execute(input, {
        coordinates: {
          tenantId: `${context.tenantId}` as never,
          workspaceId: `${context.workspaceId}` as never,
          runId: `${context.runId}` as never,
        },
        now: new Date().toISOString(),
        metadata: {
          executionLatencyBudgetMs: Math.max(1, Date.now() - started),
        },
      });
      this.#diagnostics.push(...output.diagnostics);
      return ok(output.output as TOut);
    } catch (error) {
      return fail((error as Error).message);
    }
  }

  async executeSequence<TIn extends Record<string, unknown>, TOut extends Record<string, unknown>>(
    stages: readonly PluginState[],
    input: NoInfer<TIn>,
    context: {
      tenantId: string;
      workspaceId: string;
      runId: string;
    },
    onPluginEvent: (event: PluginDiagnostic) => Promise<void> = async () => undefined,
  ): Promise<Result<TOut, string>> {
    const ordered = this.resolveOrder(stages);
    const AsyncStack = createAsyncStack();
    await using stack = new AsyncStack();
    const started = Date.now();
    const trace: PluginDiagnostic[] = [];
    let current = input as Record<string, unknown>;
    for (const plugin of ordered) {
      if (plugin.dispose) {
        stack.use({
          [Symbol.asyncDispose]: async () => plugin.dispose?.(),
        });
      }
      const result = await this.resolve<Record<string, unknown>, Record<string, unknown>>(
        plugin.id,
        current,
        context,
      );
      if (!result.ok) {
        return fail(result.error);
      }

      current = {
        ...current,
        ...result.value,
      };
      const event: PluginDiagnostic = {
        pluginId: plugin.id,
        message: `${plugin.name}.executed`,
        severity: 'info',
        timestamp: new Date().toISOString(),
      };
      trace.push(event);
      await onPluginEvent(event);
      await plugin.dispose?.();
    }

    const runtimeTrace: PlaybookExecutionTrace = {
      runId: `${context.tenantId}:${context.workspaceId}:${context.runId}` as never,
      pluginOrder: ordered.map((plugin) => plugin.id),
      totals: {
        elapsedMs: Date.now() - started,
        errorCount: trace.filter((entry) => entry.severity === 'error').length,
        warningCount: trace.filter((entry) => entry.severity === 'warn').length,
      },
    };
    this.#diagnostics.push(...trace, ...runtimeTrace.pluginOrder.map((pluginId) => ({
      pluginId: pluginId as PluginTag,
      message: `trace:${pluginId}`,
      severity: 'info',
      timestamp: new Date().toISOString(),
    } satisfies PluginDiagnostic)));

    return ok(current as TOut);
  }

  diagnosticsBySeverity(): PluginDiagnosticBySeverity<{
    info: readonly PluginDiagnostic[];
    warn: readonly PluginDiagnostic[];
    error: readonly PluginDiagnostic[];
  }> {
    const grouped = {
      info: [] as PluginDiagnostic[],
      warn: [] as PluginDiagnostic[],
      error: [] as PluginDiagnostic[],
    };
    for (const entry of this.#diagnostics) {
      grouped[entry.severity].push(entry);
    }
    return {
      info: grouped.info,
      warn: grouped.warn,
      error: grouped.error,
    };
  }

  manifestDigest(): string {
    return [...this.#plugins.values()]
      .map((plugin) => `${plugin.namespace}/${plugin.name}@${plugin.version}`)
      .toSorted()
      .join('|');
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const plugin of this.#plugins.values()) {
      await plugin.dispose?.();
    }
    this.#diagnostics.length = 0;
  }
}

export const registerPluginCatalog = <TPlugins extends readonly PlaybookPluginDefinition[]>(
  plugins: TPlugins,
): PlaybookPluginRegistry<TPlugins> => new PlaybookPluginRegistry(plugins);

export const validatePluginTag = (value: string): value is PluginTag => /^playbook:[a-z0-9-]+\/plugin:[a-z0-9-]+:v\d+\.\d+\.\d+$/.test(value);

export const ensureManifest = (
  registry: PlaybookPluginRegistry,
  namespace: PluginNamespace,
): PlaybookCatalogManifest => {
  return registry.manifestForNamespace(namespace)
    ?? {
      namespace,
      tenantId: `tenant:${namespace}` as unknown as PlaybookCatalogManifest['tenantId'],
      workspaceId: `workspace:${namespace}` as unknown as PlaybookCatalogManifest['workspaceId'],
      entries: [],
    };
};
