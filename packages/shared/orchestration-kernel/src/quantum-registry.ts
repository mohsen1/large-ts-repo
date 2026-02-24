import type { PluginId } from './identity';
import type { NoInfer, RecursiveTuple } from './types';
import type { OrchestrationPlugin, PluginInputMap, PluginOutputMap, PluginPhase, PluginInvocationOptions } from './plugin-registry';
import { PluginRegistry, registryEvents } from './plugin-registry';
import type { RuntimeEvent } from './plugin-registry';

export type RegistryNamespace = `ns:${string}`;
export type RegistryTagFilter = `tag:${string}`;
export type RegistryRoute<TSpace extends string = string> = `${TSpace}/route`;
export type RegistryEventName<TStage extends PluginPhase = PluginPhase> = `registry/${TStage}`;

export interface PluginRoutePattern<TNamespace extends string = string, TPhase extends PluginPhase = PluginPhase> {
  readonly namespace: TNamespace;
  readonly phase: TPhase;
  readonly route: RegistryRoute<TNamespace>;
}

export type RouteMap<TPlugins extends readonly OrchestrationPlugin[]> = {
  [TPlugin in TPlugins[number] as TPlugin['id']]: TPlugin;
};

export type NamespaceMap<TPlugins extends readonly OrchestrationPlugin[]> = Record<string, readonly TPlugins[number][]>;
export type TagMap<TPlugins extends readonly OrchestrationPlugin[]> = Record<string, readonly TPlugins[number][]>;

export interface RegistrySelection<TPlugin extends OrchestrationPlugin = OrchestrationPlugin> {
  readonly namespace?: TPlugin['namespace'];
  readonly phase?: TPlugin['phase'];
  readonly tag?: TPlugin['tags'][number];
}

export interface RegistryExecutionResult<TPlugins extends readonly OrchestrationPlugin[]> {
  readonly pluginKeys: readonly PluginId[];
  readonly events: readonly RuntimeEvent[];
  readonly output: PluginOutputMap<TPlugins>;
}

export interface RegistryStats {
  readonly byPhase: Readonly<Record<PluginPhase, number>>;
  readonly byNamespace: Readonly<Record<string, number>>;
  readonly byTag: Readonly<Record<string, number>>;
}

export interface RegistrySummary {
  readonly totalPlugins: number;
  readonly namespaces: readonly string[];
  readonly tags: readonly string[];
  readonly phases: readonly PluginPhase[];
  readonly routes: readonly RegistryRoute[];
}

export interface RegistryRunnerOptions<TContext = unknown> {
  readonly namespace?: PluginRoutePattern['namespace'];
  readonly phase?: PluginPhase;
  readonly tag?: string;
  readonly context?: NoInfer<TContext>;
}

export class QuantumPluginDirectory<TPlugins extends readonly OrchestrationPlugin[]> {
  readonly #registry: PluginRegistry<TPlugins>;
  readonly #namespaceMap: NamespaceMap<TPlugins>;
  readonly #tagMap: TagMap<TPlugins>;

  constructor(plugins: TPlugins) {
    this.#registry = new PluginRegistry(plugins);
    this.#namespaceMap = this.buildNamespaceMap(plugins);
    this.#tagMap = this.buildTagMap(plugins);
  }

  get registry(): PluginRegistry<TPlugins> {
    return this.#registry;
  }

  get namespaces(): readonly string[] {
    return Object.keys(this.#namespaceMap);
  }

  get tags(): readonly string[] {
    const tags = this.#registry.asPayload().flatMap((plugin) => plugin.tags);
    const uniq = tags.reduce<Record<string, true>>((acc, tag) => {
      acc[tag] = true;
      return acc;
    }, {});
    return Object.keys(uniq);
  }

  get phases(): readonly PluginPhase[] {
    const record = this.#registry.toDiagnosticMap();
    return ['init', 'plan', 'execute', 'observe', 'finalize'].filter(
      (phase): phase is PluginPhase => (record[phase] ?? 0) > 0,
    );
  }

  get summary(): RegistrySummary {
    const namespaceCount: Record<string, number> = {};
    const tagCount: Record<string, number> = {};
    for (const plugin of this.#registry.asPayload()) {
      namespaceCount[plugin.namespace] = (namespaceCount[plugin.namespace] ?? 0) + 1;
      for (const tag of plugin.tags) {
        tagCount[tag] = (tagCount[tag] ?? 0) + 1;
      }
    }

    const byPhase = this.#registry.toDiagnosticMap();
    return {
      totalPlugins: this.#registry.asPayload().length,
      namespaces: Object.keys(namespaceCount),
      tags: Object.keys(tagCount),
      phases: Object.entries(byPhase)
        .filter((entry) => entry[1] > 0)
        .map(([phase]) => phase as PluginPhase),
      routes: Object.keys(namespaceCount).map((namespace) => `${namespace}/route` as RegistryRoute),
    };
  }

  get stats(): RegistryStats {
    const byPhase = {
      init: 0,
      plan: 0,
      execute: 0,
      observe: 0,
      finalize: 0,
    } as Record<PluginPhase, number>;
    const byNamespace: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    for (const plugin of this.#registry.asPayload()) {
      byPhase[plugin.phase] += 1;
      byNamespace[plugin.namespace] = (byNamespace[plugin.namespace] ?? 0) + 1;
      for (const tag of plugin.tags) {
        byTag[tag] = (byTag[tag] ?? 0) + 1;
      }
    }
    return { byPhase, byNamespace, byTag };
  }

  findById<TPlugin extends TPlugins[number]>(id: NoInfer<TPlugin['id']>): TPlugin | undefined {
    return this.#registry.getById(id) as TPlugin | undefined;
  }

  findByRoute<T extends PluginRoutePattern['route']>(route: NoInfer<T>): readonly TPlugins[number][] {
    const namespace = route.replace('/route', '') as TPlugins[number]['namespace'];
    return this.byNamespace(namespace);
  }

  byNamespace(namespace: TPlugins[number]['namespace']): readonly TPlugins[number][] {
    return (this.#namespaceMap[namespace] as readonly TPlugins[number][]) ?? [];
  }

  byTag<TPlugin extends TPlugins[number]>(tag: NoInfer<TPlugin['tags'][number]>): readonly TPlugin[] {
    return (this.#tagMap[tag as string] as readonly TPlugin[]) ?? [];
  }

  byCriteria<TPlugin extends TPlugins[number]>(
    filter: RegistrySelection<TPlugin>,
  ): readonly TPlugin[] {
    const selected = this.#registry.asPayload().filter((candidate) => {
      if (filter.namespace && candidate.namespace !== filter.namespace) {
        return false;
      }
      if (filter.phase && candidate.phase !== filter.phase) {
        return false;
      }
      if (filter.tag && !candidate.tags.includes(filter.tag)) {
        return false;
      }
      return true;
    });
    return selected as unknown as readonly TPlugin[];
  }

  async runSequence<TInput>(
    input: TInput,
    options: RegistryRunnerOptions = {},
  ): Promise<RegistryExecutionResult<TPlugins>> {
    const selected = this.byCriteria({
      namespace: options.namespace as TPlugins[number]['namespace'] | undefined,
      phase: options.phase,
      tag: options.tag,
    });

    const output = new Map<PluginId, unknown>();
    for (const plugin of selected) {
      const context = { scope: options.context } as PluginInvocationOptions;
      const pluginInput = input as PluginInputMap<TPlugins>[TPlugins[number]['id']];
      const result = await this.#registry.run(plugin.id as TPlugins[number]['id'], pluginInput as never, context);
      output.set(plugin.id, result);
    }

    const pluginEvents = await registryEvents(this.#registry);
    return {
      pluginKeys: [...this.#registry.asPayload().map((plugin) => plugin.id)],
      events: pluginEvents,
      output: Object.fromEntries(output) as PluginOutputMap<TPlugins>,
    };
  }

  buildTuple<TPrefix extends string, T extends OrchestrationPlugin>(
    ...tuples: RecursiveTuple<T, 3>
  ): RecursiveTuple<T, 3> {
    return tuples;
  }

  private buildNamespaceMap(plugins: TPlugins): NamespaceMap<TPlugins> {
    const map: NamespaceMap<TPlugins> = {} as NamespaceMap<TPlugins>;
    for (const plugin of plugins) {
      const current = (map[plugin.namespace] ?? []) as readonly TPlugins[number][];
      map[plugin.namespace] = [...current, plugin] as readonly TPlugins[number][];
    }
    return map;
  }

  private buildTagMap(plugins: TPlugins): TagMap<TPlugins> {
    const map: TagMap<TPlugins> = {} as TagMap<TPlugins>;
    for (const plugin of plugins) {
      for (const tag of plugin.tags) {
        const current = (map[tag] ?? []) as readonly TPlugins[number][];
        map[tag] = [...current, plugin] as readonly TPlugins[number][];
      }
    }
    return map;
  }
}

export const makeRegistryPattern = <TNamespace extends string, TPhase extends PluginPhase>(
  namespace: TNamespace,
  phase: TPhase,
): PluginRoutePattern<TNamespace, TPhase> => ({
  namespace,
  phase,
  route: `${namespace}/route` as RegistryRoute<TNamespace>,
});

export const normalizeRegistryMap = (plugins: readonly OrchestrationPlugin[]): NamespaceMap<readonly OrchestrationPlugin[]> => {
  const map: NamespaceMap<readonly OrchestrationPlugin[]> = {} as NamespaceMap<readonly OrchestrationPlugin[]>;
  for (const plugin of plugins) {
    const current = (map[plugin.namespace] ?? []) as readonly OrchestrationPlugin[];
    map[plugin.namespace] = [...current, plugin] as readonly OrchestrationPlugin[];
  }
  return map;
};

export const flattenSelections = <TPlugins extends readonly OrchestrationPlugin[]>(
  directory: QuantumPluginDirectory<TPlugins>,
  namespaces: readonly TPlugins[number]['namespace'][],
): readonly TPlugins[number][] => {
  const selected: TPlugins[number][] = [];
  for (const namespace of namespaces) {
    selected.push(...(directory.byNamespace(namespace) as TPlugins[number][]));
  }
  return selected;
};
