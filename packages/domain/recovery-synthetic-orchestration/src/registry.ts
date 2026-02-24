import {
  syntheticBuildDefaults,
  syntheticDomain,
  type SyntheticPhase,
  syntheticPhases,
  type SyntheticPriorityBand,
  syntheticPriorityBands,
} from './constants';
import type {
  PluginChainCompatibility,
  PluginByName,
  PluginByPhase,
  PluginOutputByPhase,
  SyntheticBlueprint,
  SyntheticPluginDefinition,
  PluginOutput,
  PluginInput,
} from './contracts';
import { toIterator } from './iterator';

export type PluginDependencyEdge = readonly [string, string];

export interface RegistrySnapshot<TPlugins extends readonly SyntheticPluginDefinition[]> {
  readonly size: number;
  readonly pluginsByName: PluginByName<TPlugins>;
  readonly pluginsByPhase: PluginByPhase<TPlugins>;
  readonly byOutputChannel: PluginOutputByPhase<TPlugins>;
  readonly dependencyMap: readonly PluginDependencyEdge[];
}

const bootstrapSeed = {
  namespace: syntheticDomain,
  defaultPriority: syntheticPriorityBands[0],
  version: `${syntheticBuildDefaults.maxConcurrency}.${syntheticBuildDefaults.maxRetries}.0`,
} as const;

export interface RegistryOptions {
  readonly namespace?: string;
  readonly maxConcurrency?: number;
  readonly defaultPriority?: SyntheticPriorityBand;
}

export class SyntheticPluginRegistry<TPlugins extends readonly SyntheticPluginDefinition[]> {
  private readonly registryMap: Map<string, SyntheticPluginDefinition>;
  public readonly plugins: PluginChainCompatibility<TPlugins>;

  public readonly namespace = bootstrapSeed.namespace;
  public readonly defaultPriority = bootstrapSeed.defaultPriority;

  constructor(plugins: PluginChainCompatibility<TPlugins>, public readonly options: RegistryOptions = {}) {
    this.plugins = plugins;
    this.registryMap = new Map(plugins.map((plugin) => [plugin.id, plugin] as const));
  }

  static create<TPlugins extends readonly SyntheticPluginDefinition[]>(
    plugins: PluginChainCompatibility<TPlugins>,
    options: RegistryOptions = {},
  ): SyntheticPluginRegistry<TPlugins> {
    return new SyntheticPluginRegistry(plugins, {
      namespace: options.namespace ?? bootstrapSeed.namespace,
      maxConcurrency: options.maxConcurrency ?? syntheticBuildDefaults.maxConcurrency,
      defaultPriority: options.defaultPriority ?? bootstrapSeed.defaultPriority,
    });
  }

  get snapshot(): RegistrySnapshot<TPlugins> {
    const edges = [...this.registryMap.values()].flatMap((plugin) =>
      plugin.requires.map((requirement) => [requirement, plugin.id] as const),
    ) as readonly PluginDependencyEdge[];

    const pluginsByPhase: PluginByPhase<TPlugins> = {};

    for (const plugin of this.plugins) {
      const phase = plugin.phase as TPlugins[number]['phase'];
      const previous = pluginsByPhase[phase] ?? [];
      pluginsByPhase[phase] = [...previous, plugin];
    }

    return {
      size: this.registryMap.size,
      pluginsByName: Object.fromEntries(
        this.plugins.map((plugin) => [plugin.name, plugin]),
      ) as PluginByName<TPlugins>,
      pluginsByPhase,
      byOutputChannel: this.plugins.reduce((acc, plugin) => {
        return {
          ...acc,
          [plugin.channel]: plugin.id,
        } as PluginOutputByPhase<TPlugins>;
      }, {} as PluginOutputByPhase<TPlugins>),
      dependencyMap: edges,
    };
  }

  has(id: string): boolean {
    return this.registryMap.has(id);
  }

  get(id: string): SyntheticPluginDefinition | undefined {
    return this.registryMap.get(id);
  }

  orderedByPhase(phases: readonly SyntheticPhase[] = syntheticPhases): SyntheticPluginDefinition[] {
    const set = new Set(this.registryMap.values());
    const seen = new Set<string>();

    return phases
      .flatMap((phase) =>
        [...set]
          .filter((plugin) => plugin.phase === phase)
          .toSorted((left, right) => {
            if (left.weight === right.weight) {
              return left.name.localeCompare(right.name);
            }
            return left.weight - right.weight;
          }),
      )
      .filter((plugin) => {
        if (seen.has(plugin.id)) return false;
        seen.add(plugin.id);
        return true;
      });
  }

  validateBlueprint(blueprint: SyntheticBlueprint): boolean {
    return blueprint.domain === this.namespace;
  }

  executeInputSignature<TDef extends SyntheticPluginDefinition>(definition: TDef): {
    readonly input: PluginInput<TDef>;
    readonly output: PluginOutput<TDef>;
  } {
    return {
      input: {} as PluginInput<TDef>,
      output: {} as PluginOutput<TDef>,
    };
  }

  pluginNames(): readonly string[] {
    return this.snapshot.pluginsByName === undefined
      ? []
      : toIterator(Object.values(this.snapshot.pluginsByName as Record<string, SyntheticPluginDefinition>))
          .map((plugin) => plugin.name)
          .toArray();
  }
}

export const collectPluginNames = (
  registry: SyntheticPluginRegistry<readonly SyntheticPluginDefinition[]>,
): readonly string[] => {
  return registry.snapshot.pluginsByName === undefined
    ? []
    : toIterator(Object.values(registry.snapshot.pluginsByName as Record<string, SyntheticPluginDefinition>))
        .map((plugin) => plugin.name)
        .toArray();
};
