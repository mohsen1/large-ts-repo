import type { NoInfer } from './types';
import type { PluginId } from './identity';
import { type MappedEvents } from './types';
import { OrchestrationScope, withScope } from './disposable-scope';

export type PluginPhase = 'init' | 'plan' | 'execute' | 'observe' | 'finalize';
export type PluginOutcomeStatus = 'ok' | 'warn' | 'skip' | 'error';

export interface RuntimeEvent<Phase extends PluginPhase = PluginPhase, Key extends string = string> {
  readonly phase: Phase;
  readonly pluginId: PluginId;
  readonly key: `${PluginId}:${Key}`;
  readonly status: PluginOutcomeStatus;
  readonly details: Record<string, unknown>;
}

export type PluginEventName<
  TSpace extends string,
  TKind extends string,
> = `${TSpace}/${TKind}`;

export interface PluginInvocationOptions {
  readonly scope?: OrchestrationScope;
  readonly deadlineMs?: number;
}

export interface OrchestrationPlugin<TName extends string = string, TInput = unknown, TOutput = unknown, TTag extends string = string> {
  readonly id: PluginId;
  readonly namespace: TName;
  readonly version: string;
  readonly phase: PluginPhase;
  readonly tags: readonly TTag[];
  readonly description: string;
  readonly run:
    | ((input: TInput, context: { readonly options: PluginInvocationOptions }) => Promise<TOutput>)
    | ((input: TInput, context: { readonly options: PluginInvocationOptions }) => TOutput);
}

export type PluginOutputType<TPlugin> = TPlugin extends OrchestrationPlugin<any, any, infer TOutput, any> ? TOutput : never;
export type PluginInputType<TPlugin> = TPlugin extends OrchestrationPlugin<any, infer TInput, any, any> ? TInput : never;
export type PluginTags<TPlugin> = TPlugin extends OrchestrationPlugin<any, any, any, infer TTags> ? TTags : never;
export type PluginInputMap<TPlugins extends readonly OrchestrationPlugin[]> = {
  [TPlugin in TPlugins[number] as TPlugin['id']]: PluginInputType<TPlugin>;
};
export type PluginOutputMap<TPlugins extends readonly OrchestrationPlugin[]> = {
  [TPlugin in TPlugins[number] as TPlugin['id']]: PluginOutputType<TPlugin>;
};

export type RegisterablePlugin<TPlugins extends readonly OrchestrationPlugin[], TPlugin extends OrchestrationPlugin> = [
  ...TPlugins,
  TPlugin,
];

export interface RegistrySearchFilter<TPlugin extends OrchestrationPlugin = OrchestrationPlugin> {
  readonly byTag?: TPlugin['tags'][number];
  readonly phase?: TPlugin['phase'];
}

export type RegistryEventPayload = MappedEvents<Record<'started' | 'completed' | 'failed', string>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export class PluginRegistry<TPlugins extends readonly OrchestrationPlugin[]> {
  #plugins: TPlugins;
  #byId: Map<PluginId, OrchestrationPlugin>;

  constructor(plugins: TPlugins) {
    this.#plugins = plugins;
    this.#byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  }

  static empty(): PluginRegistry<readonly []> {
    return new PluginRegistry([]);
  }

  has(id: PluginId): boolean {
    return this.#byId.has(id);
  }

  find(predicate: (plugin: TPlugins[number]) => boolean): readonly TPlugins[number][] {
    return this.#plugins.filter(predicate);
  }

  getById<TPlugin extends TPlugins[number]>(id: NoInfer<TPlugin['id']>): TPlugin | undefined {
    return this.#byId.get(id) as TPlugin | undefined;
  }

  with<TPlugin extends OrchestrationPlugin>(
    plugin: NoInfer<TPlugin>,
  ): PluginRegistry<RegisterablePlugin<TPlugins, TPlugin>> {
    return new PluginRegistry([...this.#plugins, plugin] as unknown as RegisterablePlugin<TPlugins, TPlugin>);
  }

  select<TFilter extends RegistrySearchFilter>(filter: TFilter): PluginRegistry<readonly []> {
    const pluginList = this.#plugins.filter((plugin) => {
      if (filter.byTag && !plugin.tags.includes(filter.byTag as never)) {
        return false;
      }
      if (filter.phase && plugin.phase !== filter.phase) {
        return false;
      }
      return true;
    });
    return new PluginRegistry(pluginList as unknown as readonly []);
  }

  async runBatch<TScope>(
    context: { readonly scope: OrchestrationScope; readonly registry: TScope },
    input: PluginInputMap<TPlugins>[TPlugins[number]['id']],
  ): Promise<PluginOutputMap<TPlugins>> {
    const entries = new Map<string, PluginOutputMap<TPlugins>[TPlugins[number]['id']]>();
    for (const plugin of this.#plugins) {
      const maybeResult = plugin.run(
        input as PluginInputType<typeof plugin>,
        { options: { scope: context.scope } },
      );
      const result = await Promise.resolve(maybeResult as PluginOutputType<typeof plugin>);
      entries.set(plugin.id as string, result as PluginOutputMap<TPlugins>[TPlugins[number]['id']]);
    }
    return entries as PluginOutputMap<TPlugins>;
  }

  async run<
    TPlugin extends TPlugins[number],
    TInput extends PluginInputType<TPlugin>,
  >(id: NoInfer<TPlugin['id']>, input: TInput, options: PluginInvocationOptions = {}): Promise<PluginOutputType<TPlugin>> {
    const plugin = this.#byId.get(id as TPlugin['id']);
    if (!plugin) {
      throw new Error(`unknown-plugin:${String(id)}`);
    }
    const value = plugin.run(input as PluginInputType<TPlugin>, { options }) as PluginOutputType<TPlugin>;
    return Promise.resolve(value);
  }

  toDiagnosticMap(): Record<string, number> {
    const record: Record<string, number> = {};
    for (const plugin of this.#plugins) {
      const value = record[plugin.phase] ?? 0;
      record[plugin.phase] = value + 1;
    }
    return record;
  }

  toEventLog(): ReadonlyArray<RuntimeEvent> {
    return this.#plugins.map((plugin) => ({
      phase: plugin.phase,
      pluginId: plugin.id,
      key: `${plugin.id}:registered`,
      status: 'ok',
      details: {
        tags: plugin.tags,
        version: plugin.version,
      },
    }));
  }

  asPayload(): ReadonlyArray<OrchestrationPlugin> {
    return [...this.#plugins];
  }
}

type PluginMetadataTemplate<TPlugin extends OrchestrationPlugin> = {
  readonly id: TPlugin['id'];
  readonly namespace: TPlugin['namespace'];
  readonly version: TPlugin['version'];
  readonly phase: TPlugin['phase'];
  readonly tags: TPlugin['tags'];
};

export const normalizePlugin = <TPlugin extends OrchestrationPlugin>(plugin: TPlugin): PluginMetadataTemplate<TPlugin> => {
  return {
    id: plugin.id,
    namespace: plugin.namespace,
    version: plugin.version,
    phase: plugin.phase,
    tags: plugin.tags,
  };
};

export const pluginManifestShape = (plugin: OrchestrationPlugin): Record<string, unknown> => {
  const optional = plugin.description as string | undefined;
  const base: Record<string, unknown> = {
    id: plugin.id,
    namespace: plugin.namespace,
    version: plugin.version,
    phase: plugin.phase,
    tags: [...plugin.tags],
  };
  return isRecord(optional) ? { ...base, description: optional } : base;
};

export const registryEvents = async <TPlugins extends readonly OrchestrationPlugin[]>(
  registry: PluginRegistry<TPlugins>,
): Promise<readonly RuntimeEvent[]> =>
  withScope(async () => {
    return registry
      .toEventLog()
      .map((event) => ({
        ...event,
        details: {
          ...event.details,
          optionalKeys: Object.keys(event) as Array<keyof RuntimeEvent>,
        },
      }))
      .toSorted((left, right) => left.phase.localeCompare(right.phase));
  });
