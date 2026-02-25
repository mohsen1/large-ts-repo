import {
  type ControlLabCategory,
  type ControlLabContext,
  type ControlLabPlugin,
  type ControlLabTopic,
  type ControlLabVerb,
  type LabPluginId,
  pluginKeyFor,
} from './types';

export type PluginByTopic<TPlugins extends readonly ControlLabPlugin[]> = {
  [T in TPlugins[number] as T['topic']]: T;
};

export type PluginByCategory<TPlugins extends readonly ControlLabPlugin[]> = {
  [T in TPlugins[number] as T['category']]: { readonly [K in TPlugins[number] as K['category']]: K['topic'] };
};

export type PluginTopics<TPlugins extends readonly ControlLabPlugin[]> = {
  readonly [K in TPlugins[number] as K['id']]: `${K['kind']}::${K['stage']}`;
};

export interface RuntimeRegistryConfig {
  readonly capacity: number;
  readonly eagerResolve: boolean;
  readonly failFast?: boolean;
}

export interface PluginExecutionStats {
  readonly count: number;
  readonly registered: number;
  readonly resolved: number;
}

export class PluginRegistry<TPlugins extends readonly ControlLabPlugin[]> implements Disposable {
  readonly #index: Map<string, ControlLabPlugin> = new Map();
  readonly #ordered: TPlugins[number][] = [];
  readonly #config: RuntimeRegistryConfig;

  constructor(plugins: TPlugins, config: RuntimeRegistryConfig) {
    this.#config = config;
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  register(plugin: TPlugins[number]): void {
    if (this.#index.size >= this.#config.capacity) {
      throw new Error('plugin registry at capacity');
    }
    this.#index.set(String(plugin.id), plugin);
    this.#ordered.push(plugin);
  }

  get<TId extends string>(id: TId): TPlugins[number] | undefined {
    return this.#index.get(id);
  }

  has(id: LabPluginId): boolean {
    return this.#index.has(id);
  }

  entries(): readonly [LabPluginId, TPlugins[number]][] {
    return [...this.#index.entries()].map(([id, plugin]) => [id as LabPluginId, plugin]);
  }

  keys(): readonly LabPluginId[] {
    return [...this.#index.keys()] as LabPluginId[];
  }

  topics(): readonly string[] {
    return this.#ordered.map((plugin) => pluginKeyFor(plugin));
  }

  byCategory(category: ControlLabCategory): readonly TPlugins[number][] {
    return this.#ordered.filter((plugin) => plugin.category === category);
  }

  byVerb(verb: ControlLabVerb): readonly TPlugins[number][] {
    return this.#ordered.filter((plugin) => plugin.stage === verb);
  }

  byTopic(topic: ControlLabTopic): readonly TPlugins[number][] {
    const expected = String(topic).split(':')[0];
    return this.#ordered.filter((plugin) => String(plugin.topic).startsWith(expected));
  }

  runOrder(context: ControlLabContext): readonly TPlugins[number][] {
    if (this.#config.eagerResolve) {
      return [...this.#ordered].sort((left, right) => {
        if (left.weight !== right.weight) {
          return right.weight - left.weight;
        }
        return left.kind.localeCompare(right.kind);
      });
    }

    return this.#ordered.filter((plugin) =>
      plugin.dependencies.every((dependency) => Object.prototype.hasOwnProperty.call(context.context, String(dependency))),
    );
  }

  countByDomain(): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const plugin of this.#ordered) {
      acc[plugin.domain] = (acc[plugin.domain] ?? 0) + 1;
    }
    return acc;
  }

  stats(): PluginExecutionStats {
    return {
      count: this.#ordered.length,
      registered: this.#index.size,
      resolved: this.#ordered.filter((plugin) => plugin.verbs.length > 0).length,
    };
  }

  [Symbol.dispose](): void {
    this.#index.clear();
    this.#ordered.length = 0;
  }
}
