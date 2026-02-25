import { PluginDependency, PluginName } from '@shared/typed-orchestration-core';
import type { MeshPluginDefinition } from './plugins.js';
import type { PluginRuntimeContext } from './types.js';

type IteratorChain<T> = IterableIterator<T> & {
  map<U>(mapper: (value: T) => U): IteratorChain<U>;
  filter(predicate: (value: T) => boolean): IteratorChain<T>;
  toArray(): T[];
};

type DependencyTuple<TPlugin extends MeshPluginDefinition> = {
  readonly plugin: TPlugin;
  readonly registeredAt: string;
  readonly namespace: string;
};

const iteratorFrom = (globalThis as { Iterator?: { from?: <T>(value: Iterable<T>) => IteratorChain<T> } }).Iterator?.from;

export interface DependencyResolution {
  readonly resolved: readonly PluginName[];
  readonly unresolved: readonly PluginName[];
  readonly cycles: readonly PluginName[];
}

export class MeshPluginRegistry<TPlugins extends readonly MeshPluginDefinition[]> implements AsyncDisposable {
  readonly #plugins = new Map<PluginName, DependencyTuple<MeshPluginDefinition>>();
  #disposed = false;

  public constructor(private readonly plugins: TPlugins) {
    for (const plugin of plugins) {
      this.#plugins.set(plugin.name, {
        plugin,
        registeredAt: new Date().toISOString(),
        namespace: plugin.namespace,
      });
    }
  }

  public has(pluginName: PluginName): boolean {
    return this.#plugins.has(pluginName);
  }

  public get(pluginName: PluginName): MeshPluginDefinition | undefined {
    const found = this.#plugins.get(pluginName);
    return found?.plugin;
  }

  public names(): readonly PluginName[] {
    const values = [...this.#plugins.keys()];
    const iter = iteratorFrom?.(values);
    return iter ? iter.toArray().toSorted((left, right) => left.localeCompare(right)) : values.toSorted((left, right) => left.localeCompare(right));
  }

  public stages(): readonly PluginRuntimeContext['stage'][] {
    return [...this.#plugins.values()].map((entry) => entry.plugin.stage);
  }

  public get dependencies(): ReadonlyMap<PluginName, readonly PluginName[]> {
    const output = new Map<PluginName, readonly PluginName[]>();
    for (const [name, payload] of this.#plugins) {
      output.set(name, payload.plugin.dependencies as readonly PluginName[]);
    }
    return output;
  }

  public async resolveOrder(): Promise<readonly PluginName[]> {
    const graph = new Map<PluginName, PluginDependency[]>();
    for (const [name, payload] of this.#plugins) {
      const dependencies = payload.plugin.dependencies as PluginDependency[];
      graph.set(name, dependencies as PluginDependency[]);
    }

    const ordered: PluginName[] = [];
    const visiting = new Set<PluginName>();
    const resolved = new Set<PluginName>();

    const walk = (name: PluginName): void => {
      if (resolved.has(name)) {
        return;
      }
      if (visiting.has(name)) {
        throw new Error(`Plugin dependency cycle: ${name}`);
      }
      visiting.add(name);
      const deps = graph.get(name) ?? [];
      for (const dependency of deps) {
        const target = String(dependency).replace(/^dep:/, '') as PluginName;
        if (!this.#plugins.has(target)) {
          throw new Error(`Missing plugin dependency ${dependency}`);
        }
        walk(target);
      }
      visiting.delete(name);
      resolved.add(name);
      ordered.push(name);
    };

    for (const name of this.names()) {
      walk(name);
    }

    return ordered;
  }

  public dependencyReport(): DependencyResolution {
    const unresolved: PluginName[] = [];
    for (const payload of this.#plugins.values()) {
      for (const dependency of payload.plugin.dependencies) {
        if (!this.#plugins.has(dependency)) {
          unresolved.push(dependency as PluginName);
        }
      }
    }

    return {
      resolved: this.names(),
      unresolved: [...new Set(unresolved)],
      cycles: this.names(),
    };
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#plugins.clear();
  }
}
