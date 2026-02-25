import { Brand } from '@shared/type-level';
import { ScenarioId, ScenarioRunId, createRunId } from './identity';
import { StagePayload } from './topology';
import { OrchestrationRunContext } from './orchestrations';

export type RegistryId<TTag extends string> = Brand<string, `registry-${TTag}`>;

export interface RuntimePluginMetadata {
  readonly id: RegistryId<'plugin'>;
  readonly name: string;
  readonly domain: string;
  readonly version: `${number}.${number}.${number}`;
}

export interface ScenarioPlugin<TInput, TOutput, TTags extends readonly string[]> {
  readonly namespace: Brand<string, 'plugin-namespace'>;
  readonly pluginId: RegistryId<'plugin'>;
  readonly supportedKinds: TTags;
  readonly metadata: RuntimePluginMetadata;
  execute(input: TInput, context: OrchestrationRunContext<TInput, TOutput>): Promise<TOutput>;
}

export type PluginByTag<
  TPlugins extends readonly ScenarioPlugin<unknown, unknown, readonly string[]>[],
  TTag extends string,
> = TPlugins extends readonly [infer Head, ...infer Tail]
  ? Head extends ScenarioPlugin<infer Input, infer Output, infer Tags>
    ? TTag extends Tags[number]
      ? readonly [ScenarioPlugin<Input, Output, Tags>, ...PluginByTag<Extract<Tail, readonly ScenarioPlugin<unknown, unknown, readonly string[]>[]>, TTag>]
      : PluginByTag<Extract<Tail, readonly ScenarioPlugin<unknown, unknown, readonly string[]>[]>, TTag>
    : []
  : [];

export interface PluginRegistryOptions {
  readonly namespace: string;
  readonly enabled: boolean;
  readonly concurrency: number;
}

export class ScenarioPluginRegistry<
  TPlugins extends readonly ScenarioPlugin<any, any, readonly string[]>[],
  TTags extends string = TPlugins[number]['supportedKinds'][number],
> {
  readonly #plugins = new Map<RegistryId<'plugin'>, TPlugins[number]>();
  readonly #options: PluginRegistryOptions;
  constructor(plugins: TPlugins, options: PluginRegistryOptions) {
    for (const plugin of plugins) {
      this.#plugins.set(plugin.pluginId, plugin);
    }
    this.#options = options;
  }

  register(plugin: ScenarioPlugin<any, any, readonly string[]>): void {
    this.#plugins.set(plugin.pluginId, plugin as TPlugins[number]);
  }

  get(id: RegistryId<'plugin'>): TPlugins[number] | undefined {
    return this.#plugins.get(id);
  }

  byTag<TTag extends TTags>(tag: TTag): PluginByTag<TPlugins, TTag> {
    const out: TPlugins[number][] = [];
    for (const plugin of this.#plugins.values()) {
      if (plugin.supportedKinds.includes(tag as string)) {
        out.push(plugin);
      }
    }
    return out as PluginByTag<TPlugins, TTag>;
  }

  all(): readonly TPlugins[number][] {
    return [...this.#plugins.values()];
  }

  [Symbol.iterator](): IterableIterator<TPlugins[number]> {
    return this.#plugins.values();
  }

  [Symbol.dispose](): void {
    this.#plugins.clear();
  }
}

export interface RegistryAdapterState {
  readonly scenarioId: ScenarioId;
  readonly runId: ScenarioRunId;
  readonly heartbeatMs: number;
}

export async function bootstrapPluginRegistry<TPlugins extends readonly ScenarioPlugin<any, any, readonly string[]>[]>(
  plugins: TPlugins,
): Promise<ScenarioPluginRegistry<TPlugins>> {
  await Promise.resolve();
  return new ScenarioPluginRegistry(
    plugins,
    {
      namespace: 'scenario-design',
      enabled: true,
      concurrency: 8,
    },
  );
}

export async function* registryEvents<TPlugins extends readonly ScenarioPlugin<any, any, readonly string[]>[]>(
  registry: ScenarioPluginRegistry<TPlugins>,
): AsyncGenerator<{ plugin: TPlugins[number]; event: string }, void, void> {
  for (const plugin of registry) {
    yield { plugin: plugin as TPlugins[number], event: `${plugin.metadata.domain}:${plugin.pluginId}` };
  }
  await Promise.resolve();
}

export type AdapterContext = {
  readonly runId: ScenarioRunId;
  readonly state: RegistryAdapterState;
};

export interface RegistryAdapter<TConfig extends Record<string, unknown>, TInput, TOutput> {
  readonly id: RegistryId<'adapter'>;
  readonly stageId: RegistryId<'stage'>;
  readonly config: Readonly<TConfig>;
  readonly transform: (input: TInput, context: AdapterContext) => Promise<StagePayload<TConfig, TInput, TOutput>>;
}

export async function registerAdapter<TConfig extends Record<string, unknown>, TInput, TOutput>(
  adapter: RegistryAdapter<TConfig, TInput, TOutput>,
  registry: ScenarioPluginRegistry<readonly ScenarioPlugin<unknown, unknown, readonly string[]>[]>,
): Promise<ScenarioRunId> {
  await registryEvents(registry);
  return createRunId('adapter', BigInt(adapter.config instanceof Object ? Object.keys(adapter.config as object).length : 0));
}
