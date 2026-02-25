import type { PluginDefinition, PluginResultType } from './plugin-types.js';

export interface RegistrySnapshot<T extends readonly PluginDefinition[]> {
  plugins: T;
  byId: { [key: string]: T[number] };
}

export class PluginRegistry<TPlugins extends readonly PluginDefinition[] = readonly PluginDefinition[]> {
  #plugins = new Map<string, TPlugins[number]>();

  constructor(plugins: TPlugins) {
    for (const plugin of plugins) {
      this.#plugins.set(plugin.id, plugin);
    }
  }

  list(): ReadonlyArray<TPlugins[number]> {
    return [...this.#plugins.values()];
  }

  has(id: string): boolean {
    return this.#plugins.has(id);
  }

  get<TId extends string>(id: TId): TPlugins[number] | undefined {
    return this.#plugins.get(id);
  }

  findByCapability(capability: string): TPlugins[number][] {
    const out = [] as TPlugins[number][];
    for (const plugin of this.list()) {
      if (plugin.capabilities.includes(capability as never)) {
        out.push(plugin);
      }
    }
    return out;
  }

  async runAll<TContext>(inputById: TContext): Promise<Record<string, PluginResultType<TPlugins[number]>>> {
    const out: Record<string, PluginResultType<TPlugins[number]>> = {};
    for (const plugin of this.list()) {
      const result = await Promise.resolve(
        plugin.run({
          runId: `${plugin.scope}:${plugin.id}` as never,
          startedAt: new Date().toISOString(),
          state: plugin,
          input: (inputById as never)[plugin.id] as never,
          emit: () => {},
        }),
      );
      out[plugin.id] = result.output as PluginResultType<TPlugins[number]>;
    }
    return out;
  }

  dispose(): void {
    this.#plugins.clear();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

export const createRegistry = <const T extends readonly PluginDefinition[]>(plugins: T): PluginRegistry<T> => {
  return new PluginRegistry<T>(plugins);
};

export const describeRegistry = <T extends readonly PluginDefinition[]>(registry: PluginRegistry<T>): RegistrySnapshot<T> => ({
  plugins: registry.list() as T,
  byId: registry.list().reduce<Record<string, T[number]>>((acc, plugin) => {
    acc[plugin.id] = plugin;
    return acc;
  }, {}),
});

export const hasMatchingCapability = <T extends readonly PluginDefinition[]>(
  registry: PluginRegistry<T>,
  capability: string,
): boolean => {
  return registry.findByCapability(capability).length > 0;
};
