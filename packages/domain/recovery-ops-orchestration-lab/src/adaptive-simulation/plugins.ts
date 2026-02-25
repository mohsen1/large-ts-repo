import { randomUUID } from 'node:crypto';
import {
  asPluginId,
  type PluginKind,
  type SimulationConfig,
  type SimulationPhase,
  type SimulationPluginId,
  type SimulationPluginOutput,
} from './types';

export type SimulationPluginType<T extends string = string> = `recovery/ops/sim/${T}`;
export type SimulationPluginTag<T extends string = string> = `@simulation/${T}`;

export interface SimulationPluginMetadata {
  readonly pluginId: SimulationPluginId;
  readonly namespace: string;
  readonly version: `${number}.${number}.${number}`;
  readonly supports: readonly SimulationPhase[];
  readonly weight: number;
  readonly tags: readonly string[];
}

export interface SimulationPluginInput<TPayload = unknown, TContext = { readonly namespace: string }> {
  readonly runId: string;
  readonly phase: SimulationPhase;
  readonly payload: TPayload;
  readonly config: Readonly<Record<string, unknown>>;
  readonly context: TContext;
}

export interface SimulationPluginDescriptor<
  TInput = object,
  TOutput = object,
  TKind extends string = string,
> {
  readonly id: SimulationPluginId;
  readonly name: string;
  readonly kind: PluginKind<TKind>;
  readonly version: `${number}.${number}.${number}`;
  readonly supports: readonly SimulationPhase[];
  readonly metadata: SimulationPluginMetadata;
  readonly execute: (input: SimulationPluginInput<TInput, { readonly namespace: string }>) => Promise<SimulationPluginOutput<TOutput>>;
}

export interface PluginLease {
  readonly pluginId: SimulationPluginId;
  readonly removed: boolean;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

type AnyPlugin = SimulationPluginDescriptor<object, object, string>;

const orderedSupports = (left: SimulationPhase, right: SimulationPhase): number =>
  Number(left) > Number(right) ? 1 : 0;

const asPluginTag = (value: string): SimulationPluginTag<string> => `@simulation/${value}`;

export class AdaptivePluginRegistry<TPlugins extends readonly AnyPlugin[]> {
  readonly #state = {
    plugins: new Map<string, AnyPlugin>(),
    phaseMap: new Map<SimulationPhase, AnyPlugin[]>(),
    order: [] as AnyPlugin[],
  };
  #disposed = false;

  public constructor(plugins: TPlugins) {
    for (const plugin of plugins) {
      this.#register(plugin);
    }
  }

  public get count(): number {
    return this.#state.plugins.size;
  }

  public get isDisposed(): boolean {
    return this.#disposed;
  }

  public getPluginIds(): readonly SimulationPluginId[] {
    return [...this.#state.plugins.keys()].map((pluginId) => pluginId as SimulationPluginId);
  }

  public supports(phase: SimulationPhase): readonly AnyPlugin[] {
    return [...(this.#state.phaseMap.get(phase) ?? [])];
  }

  public addPlugin<TInput, TOutput, TKind extends string>(
    plugin: SimulationPluginDescriptor<TInput, TOutput, TKind>,
  ): PluginLease {
    const execute = (
      input: SimulationPluginInput<object, { readonly namespace: string }>,
    ): Promise<SimulationPluginOutput<object>> =>
      plugin.execute(
        input as SimulationPluginInput<TInput, { readonly namespace: string }>,
      ) as Promise<SimulationPluginOutput<object>>;

    const normalized: AnyPlugin = {
      ...plugin,
      metadata: {
        ...plugin.metadata,
        tags: [...plugin.metadata.tags, asPluginTag(plugin.kind)],
      },
      execute,
    };
    this.#register(normalized);

    let active = true;
    const pluginId = plugin.id;
    const removePlugin = (): void => {
      if (!active) {
        return;
      }
      active = false;
      this.#remove(pluginId);
    };

    return {
      pluginId,
      removed: false,
      [Symbol.dispose](): void {
        removePlugin();
      },
      async [Symbol.asyncDispose](): Promise<void> {
        removePlugin();
      },
    };
  }

  public async runPhase<TInput extends object, TContext extends { namespace?: string }, TOutput extends object>(
    phase: SimulationPhase,
    context: TContext,
    input: TInput,
  ): Promise<readonly SimulationPluginOutput<TOutput>[]> {
    const outputs: SimulationPluginOutput<TOutput>[] = [];

    for (const plugin of this.supports(phase)) {
      const started = performance.now();
      const payload = {
        runId: `${phase}-${randomUUID()}`,
        phase,
        payload: input,
        config: { namespace: context.namespace ?? 'global', phase },
        context: { namespace: context.namespace ?? 'global' },
      } as SimulationPluginInput<TInput, { readonly namespace: string }>;

      const output = (await plugin.execute(payload)) as SimulationPluginOutput<TOutput>;
      outputs.push({
        ...output,
        pluginId: plugin.id,
        phase,
        timestamp: new Date().toISOString(),
        elapsedMs: Math.max(0, performance.now() - started),
      });
    }

    return outputs;
  }

  public [Symbol.iterator](): IterableIterator<AnyPlugin> {
    return this.#state.order[Symbol.iterator]();
  }

  public snapshot(): Readonly<Record<string, AnyPlugin>> {
    const map: Record<string, AnyPlugin> = {};
    for (const plugin of this.#state.order) {
      map[String(plugin.kind)] = plugin;
    }
    return map;
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
    this.#state.plugins.clear();
    this.#state.phaseMap.clear();
    this.#state.order.length = 0;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#state.plugins.clear();
    this.#state.phaseMap.clear();
    this.#state.order.length = 0;
  }

  #register(plugin: AnyPlugin): void {
    const key = String(plugin.id);
    if (this.#state.plugins.has(key)) {
      throw new Error(`plugin already exists: ${key}`);
    }

    this.#state.plugins.set(key, plugin);
    this.#state.order.push(plugin);

    for (const phase of plugin.supports) {
      const bucket = this.#state.phaseMap.get(phase) ?? [];
      bucket.push(plugin);
      bucket.sort((left, right) => right.metadata.weight - left.metadata.weight);
      this.#state.phaseMap.set(phase, bucket);
    }
  }

  #remove(pluginId: SimulationPluginId): void {
    const key = String(pluginId);
    this.#state.plugins.delete(key);
    this.#state.order = this.#state.order.filter((entry) => String(entry.id) !== key);
    for (const [phase, plugins] of this.#state.phaseMap.entries()) {
      this.#state.phaseMap.set(
        phase,
        plugins.filter((entry) => String(entry.id) !== key),
      );
    }
  }
}

export const definePlugins = <
  const TPlugins extends readonly SimulationPluginDescriptor<object, object, string>[],
>(plugins: TPlugins): TPlugins => {
  const keys = plugins.map((plugin) => String(plugin.id));
  if (new Set(keys).size !== keys.length) {
    throw new Error('duplicate plugin ids');
  }
  return plugins;
};

export const createPlugin = <
  TInput,
  TOutput,
  TKind extends string,
>(
  kind: PluginKind<TKind>,
  name: string,
  namespace: string,
  supports: readonly SimulationPhase[],
  run: (input: SimulationPluginInput<TInput, { readonly namespace: string }>) => Promise<SimulationPluginOutput<TOutput>>,
): SimulationPluginDescriptor<TInput, TOutput, TKind> => ({
  id: asPluginId(`${namespace}::${name}`),
  name,
  kind,
  version: '1.0.0',
  supports: supports.toSorted(orderedSupports),
  metadata: {
    pluginId: asPluginId(`${namespace}::${name}`),
    namespace,
    version: '1.0.0',
    supports: supports.toSorted(orderedSupports),
    weight: 1,
    tags: ['adaptive', kind],
  },
  execute: run,
});

export const buildPluginRunInput = <
  TPayload extends object,
  TContext extends object,
>(
  phase: SimulationPhase,
  pluginId: string,
  payload: TPayload,
  context: TContext,
): SimulationPluginInput<TPayload, TContext> => ({
  runId: `${phase}-${pluginId}-${Date.now()}`,
  phase,
  payload,
  config: { pluginId },
  context,
});

export const buildPluginsFromConfig = (config: {
  readonly tenant: string;
  readonly labels: readonly string[];
  readonly profile?: string;
}): readonly SimulationPluginDescriptor[] => {
  const namespace = `tenant:${config.tenant}`;
  const normalize = createPlugin(
    'recovery/ops/sim/normalize',
    `normalize-${config.labels.length}`,
    namespace,
    ['discover', 'shape'],
    async (input) => ({
      pluginId: asPluginId(`${namespace}:normalize`),
      phase: input.phase,
      timestamp: new Date().toISOString(),
      elapsedMs: 0,
      payload: {
        normalized: true,
        topology: config.labels.join('-'),
      },
    }),
  );

  const score = createPlugin(
    'recovery/ops/sim/score',
    `score-${config.profile ?? 'default'}`,
    namespace,
    ['simulate', 'validate'],
    async (input) => ({
      pluginId: asPluginId(`${namespace}:score`),
      phase: input.phase,
      timestamp: new Date().toISOString(),
      elapsedMs: 0,
      payload: {
        score: Math.min(config.labels.length + 3, 10),
      },
    }),
  );

  const recommend = createPlugin(
    'recovery/ops/sim/recommend',
    `recommend-${config.tenant}`,
    namespace,
    ['recommend', 'execute', 'verify'],
    async (input) => ({
      pluginId: asPluginId(`${namespace}:recommend`),
      phase: input.phase,
      timestamp: new Date().toISOString(),
      elapsedMs: 0,
      payload: {
        recommended: true,
        labels: config.labels,
      },
    }),
  );

  return definePlugins([normalize, score, recommend]);
};

export const simulatePluginConfig = (config: SimulationConfig): Record<string, unknown> => ({
  sessionId: String(config.sessionId),
  topology: config.topology,
  pluginCount: config.plugins.length,
  phases: config.phaseSequence.join(','),
});
