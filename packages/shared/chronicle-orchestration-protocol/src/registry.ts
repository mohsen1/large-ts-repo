import { NoInfer, type Merge } from '@shared/type-level';
import {
  asStatus,
  asChronicleTag,
  type ChroniclePhase,
  type ChroniclePluginCatalog,
  type ChroniclePluginDescriptor,
  type ChroniclePluginId,
  type ChronicleRoute,
  type ChronicleRunId,
  type ChronicleTenantId,
  type ChronicleStatus,
} from './tokens.js';

export interface PluginRunSnapshot<TOutput> {
  readonly pluginId: ChroniclePluginId;
  readonly output: TOutput | null;
  readonly status: 'ready' | 'running' | 'failed';
  readonly latencyMs: number;
}

export interface PluginRunMetadata {
  readonly runId: ChronicleRunId;
  readonly route: ChronicleRoute;
  readonly startedAt: number;
}

export type RegistryOptions = {
  readonly maxParallelism: number;
  readonly defaultLatencyMs: number;
  readonly defaultRetries: number;
  readonly timeoutMs: number;
};

export interface PluginCatalogScope {
  readonly createdAt: number;
  readonly size: number;
  readonly options: RegistryOptions;
}

export class PluginRegistry<TCatalog extends ChroniclePluginCatalog> {
  readonly #catalog: Map<ChroniclePluginId, ChroniclePluginDescriptor>;
  readonly #options: RegistryOptions;
  readonly #scope: PluginCatalogScope;

  constructor(plugins: readonly ChroniclePluginDescriptor[] = [], options: Partial<RegistryOptions> = {}) {
    this.#catalog = new Map(
      plugins.map((plugin) => [plugin.id, plugin]),
    );
    this.#options = {
      maxParallelism: 4,
      defaultLatencyMs: 400,
      defaultRetries: 2,
      timeoutMs: 10_000,
      ...options,
    };
    this.#scope = {
      createdAt: Date.now(),
      size: this.#catalog.size,
      options: this.#options,
    };
  }

  static create<T extends ChroniclePluginCatalog>(
    plugins: NoInfer<readonly ChroniclePluginDescriptor[]>,
    options?: Partial<RegistryOptions>,
  ): PluginRegistry<T> {
    return new PluginRegistry<T>(plugins, options);
  }

  get scope(): PluginCatalogScope {
    return this.#scope;
  }

  all(): readonly ChroniclePluginDescriptor[] {
    return [...this.#catalog.values()];
  }

  has(pluginId: ChroniclePluginId): boolean {
    return this.#catalog.has(pluginId);
  }

  byId(pluginId: ChroniclePluginId): ChroniclePluginDescriptor | undefined {
    return this.#catalog.get(pluginId);
  }

  byPhase<TPhase extends ChroniclePhase>(...phases: readonly TPhase[]): readonly ChroniclePluginDescriptor[] {
    return this.all().filter((plugin) => phases.some((phase) => plugin.supports.includes(phase)));
  }

  register<TNext extends ChroniclePluginDescriptor>(
    plugin: TNext,
  ): PluginRegistry<TCatalog> {
    this.#catalog.set(plugin.id, plugin);
    return this;
  }

  async run<TInput, TOutput>({
    pluginId,
    tenant,
    route,
    runId,
    payload,
    signal,
  }: {
    pluginId: ChroniclePluginId;
    tenant: ChronicleTenantId;
    route: ChronicleRoute;
    runId: ChronicleRunId;
    payload: TInput;
    signal: AbortSignal;
  }): Promise<PluginRunSnapshot<TOutput>> {
    const plugin = this.byId(pluginId);
    if (!plugin) {
      return {
        pluginId,
        output: null,
        status: 'failed',
        latencyMs: 0,
      };
    }

    const start = performance.now();
    await using _stack = new AsyncDisposableStack();

    try {
      const work = plugin.process({
        tenant,
        route,
        runId,
        payload,
        signal,
        metadata: {
          plugin: String(plugin.id),
          route: String(route),
        },
      requestedBy: asChronicleTag('orchestrator'),
      }) as Promise<{
        stepId: string;
        status: ChronicleStatus;
        latencyMs: number;
        score: number;
        payload: TOutput;
      }>;

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`plugin ${String(plugin.id)} timed out`)), this.#options.defaultLatencyMs),
      );

      const result = await Promise.race([work, timeout]).catch((error) => {
        throw error;
      });

      const latencyMs = Number((performance.now() - start).toFixed(2));
      const normalized = asStatus(result.status);
      return {
        pluginId,
      output: result.payload,
        status: normalized === 'running' ? 'running' : normalized === 'failed' ? 'failed' : 'ready',
        latencyMs,
      };
    } catch (error) {
      return {
        pluginId,
        output: null,
        status: 'failed',
        latencyMs: Number((performance.now() - start).toFixed(2)),
      };
    }
  }

  async runPhase<TPhase extends ChroniclePhase, TInput, TOutput>({
    phase,
    tenant,
    route,
    runId,
    payload,
    signal,
  }: {
    phase: TPhase;
    tenant: ChronicleTenantId;
    route: ChronicleRoute;
    runId: ChronicleRunId;
    payload: TInput;
    signal: AbortSignal;
  }): Promise<readonly PluginRunSnapshot<TOutput>[]> {
    const selected = this.byPhase(phase);
    const tasks = selected.map((plugin) =>
      this.run<TInput, TOutput>({
        pluginId: plugin.id,
        tenant,
        route,
        runId,
        payload,
        signal,
      }),
    );
    return Promise.all(tasks);
  }

  toRecord(): ChroniclePluginCatalog {
    const result: Merge<Record<ChroniclePluginId, ChroniclePluginDescriptor>, Record<string, ChroniclePluginDescriptor>> = {};
    for (const plugin of this.all()) {
      result[String(plugin.id)] = plugin;
    }
    return result as ChroniclePluginCatalog;
  }

  healthLines(): readonly string[] {
    return this.all().map((plugin) => `${plugin.id}@${plugin.version}`);
  }
}

export type { RegistryOptions as PluginRegistryOptions, PluginCatalogScope as PluginRegistryScope };
