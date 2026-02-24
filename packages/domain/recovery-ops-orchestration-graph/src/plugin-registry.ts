import {
  formatISO,
  type AnyGraphPlugin,
  type PluginDependencyTuple,
  type PluginOutputEnvelope,
  type PluginResult,
  type RecoveryGraphEvent,
  type Stage,
  type PluginId,
} from './types';

type PluginMap<TPlugins extends readonly AnyGraphPlugin[]> = Record<string, TPlugins[number]>;

const reverseTuple = <T extends readonly unknown[]>(values: T): T => [...values].reverse() as unknown as T;

const toPluginId = (plugin: AnyGraphPlugin): string => plugin.id as string;

export interface PluginRegistryDiagnostics {
  readonly pluginId: PluginId;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly stage: Stage;
  readonly tagCount: number;
}

export class RecoveryGraphPluginRegistry<TPlugins extends readonly AnyGraphPlugin[]> {
  readonly #map: PluginMap<TPlugins>;
  readonly #ordered: readonly TPlugins[number][];
  readonly #records: readonly PluginRegistryDiagnostics[];

  constructor(plugins: TPlugins) {
    const map: PluginMap<TPlugins> = Object.create(null);
    for (const plugin of plugins) {
      map[toPluginId(plugin)] = plugin;
    }

    this.#ordered = this.resolveDependencyOrder(plugins);
    this.#map = map;
    this.#records = this.#ordered.map((plugin) => ({
      pluginId: plugin.id,
      startedAt: formatISO(new Date()),
      durationMs: 0,
      stage: plugin.stage,
      tagCount: plugin.metadata.tags.length,
    }));
  }

  get plugins(): readonly TPlugins[number][] {
    return this.#ordered;
  }

  get pluginEvents(): readonly RecoveryGraphEvent[] {
    return this.#ordered.map((plugin) => ({
      stage: plugin.stage,
      name: `graph:${plugin.name as string}` as RecoveryGraphEvent<string, unknown>['name'],
      payload: {
        plugin,
        manifest: this.describe(plugin),
      },
      timestamp: formatISO(new Date()),
    }));
  }

  get pluginTraceMap(): Record<string, readonly string[]> {
    return Object.fromEntries(
      this.#ordered.map((plugin) => [plugin.id as string, plugin.dependencies.map((dependency) => dependency as string)]),
    );
  }

  has(pluginId: string): boolean {
    return pluginId in this.#map;
  }

  getPlugin(pluginId: string): TPlugins[number] | undefined {
    return this.#map[pluginId];
  }

  dependenciesFor(pluginId: string): readonly PluginId[] {
    const plugin = this.getPlugin(pluginId);
    return plugin ? [...plugin.dependencies] : [];
  }

  dependencyTuple(pluginId: string): PluginDependencyTuple {
    const plugin = this.getPlugin(pluginId);
    const dependencies = plugin?.dependencies ?? [];
    return { tuple: [...dependencies] as PluginDependencyTuple['tuple'] };
  }

  describe(plugin: AnyGraphPlugin): string {
    return `${plugin.name}::${plugin.id}::${plugin.metadata.kind}@${plugin.metadata.version}`;
  }

  createOutputManifest(): PluginOutputEnvelope<TPlugins> {
    type PluginOutputKeys = keyof PluginOutputEnvelope<TPlugins>;
    const manifest = {} as PluginOutputEnvelope<TPlugins>;
    for (const plugin of this.#ordered) {
      const pluginId = plugin.id as PluginOutputKeys;
      manifest[pluginId] = [] as PluginOutputEnvelope<TPlugins>[PluginOutputKeys];
    }
    return manifest;
  }

  createDiagnosticsManifest(): { records: PluginRegistryDiagnostics[]; events: RecoveryGraphEvent[] } {
    const events: RecoveryGraphEvent[] = this.#ordered.map((plugin) => ({
      stage: plugin.stage,
      name: `graph:event:${plugin.name as string}`,
      payload: this.describe(plugin),
      timestamp: formatISO(new Date()),
    }));
    return { records: [...this.#records], events };
  }

  resolveDependencyOrder(plugins: TPlugins): TPlugins[number][] {
    const byId = new Map<string, AnyGraphPlugin>();
    for (const plugin of plugins) {
      byId.set(plugin.id as string, plugin);
    }

    const ordered: AnyGraphPlugin[] = [];
    const seen = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (seen.has(id)) {
        return;
      }
      if (visiting.has(id)) {
        throw new Error(`circular plugin dependency: ${id}`);
      }
      const plugin = byId.get(id);
      if (!plugin) {
        throw new Error(`unknown plugin dependency: ${id}`);
      }

      visiting.add(id);
      for (const dependency of plugin.dependencies) {
        visit(dependency as string);
      }
      visiting.delete(id);
      seen.add(id);
      ordered.push(plugin);
    };

    for (const plugin of plugins) {
      visit(plugin.id as string);
    }

    return ordered as TPlugins[number][];
  }

  reverse(): readonly AnyGraphPlugin[] {
    return reverseTuple(this.#ordered);
  }
}

export const isPluginInRegistry = <TPlugins extends readonly AnyGraphPlugin[]>(
  registry: RecoveryGraphPluginRegistry<TPlugins>,
  pluginId: string,
): pluginId is TPlugins[number]['id'] & string => registry.has(pluginId);
