import {
  type LabPlugin,
  type LabPluginContext,
  type LabPluginId,
  type LabPluginName,
  type LabRunId,
  type LabRuntimeEvent,
} from './types.js';

interface RegistryState {
  readonly runId: LabRunId;
  readonly pluginId: LabPluginId;
  readonly pluginName: LabPluginName;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly ok: boolean;
}

export interface PluginHandle<TPlugin extends LabPlugin> extends Disposable {
  readonly pluginId: TPlugin['id'];
  readonly pluginName: TPlugin['name'];
  readonly plugin: TPlugin;
}

type IteratorChain<T> = IterableIterator<T> & {
  filter(condition: (value: T) => boolean): IteratorChain<T> & { toArray(): T[] };
  map<U>(transform: (value: T) => U): IteratorChain<U> & { toArray(): U[] };
  toArray(): T[];
};

const iteratorFrom = (globalThis as { Iterator?: { from?: <T>(value: Iterable<T>) => IteratorChain<T> } }).Iterator?.from;

export class LabPluginRegistry<TPlugins extends readonly LabPlugin[]> implements AsyncDisposable {
  readonly #catalog = new Map<LabPluginId, LabPlugin>();
  readonly #byName = new Map<LabPluginName, LabPluginId>();
  readonly #scope = new Set<string>();
  readonly #history: RegistryState[] = [];
  #disposed = false;

  public constructor(initialPlugins: TPlugins) {
    for (const plugin of initialPlugins) {
      this.register(plugin);
    }
  }

  public get pluginNames(): readonly string[] {
    const names = [...this.#byName.keys()];
    const iter = iteratorFrom?.(names);
    return iter
        ? iter
            .toArray()
            .sort((left, right) => left.localeCompare(right))
      : names.toSorted((left, right) => left.localeCompare(right));
  }

  public get history(): readonly RegistryState[] {
    return [...this.#history];
  }

  public list(filterScope?: string): readonly LabPlugin[] {
    const values = [...this.#catalog.values()];
    const filtered = filterScope ? values.filter((plugin) => plugin.scope === filterScope) : values;

    if (!iteratorFrom) {
      return [...filtered].toSorted((left, right) => left.name.localeCompare(right.name));
    }

    const iter = iteratorFrom?.(filtered);
    return iter
      ? iter
          .filter((plugin) => plugin.name.length > 0)
          .map((plugin) => plugin)
          .toArray()
          .toSorted((left, right) => left.name.localeCompare(right.name))
      : [...filtered].toSorted((left, right) => left.name.localeCompare(right.name));
  }

  public has(pluginId: LabPluginId): boolean {
    return this.#catalog.has(pluginId);
  }

  public get<TPlugin extends LabPlugin>(pluginId: LabPluginId): TPlugin | null {
    const plugin = this.#catalog.get(pluginId);
    return plugin ? (plugin as TPlugin) : null;
  }

  public byName<TPlugin extends LabPlugin>(name: string): TPlugin | null {
    const pluginId = this.#byName.get(name as LabPluginName);
    return pluginId ? this.get<TPlugin>(pluginId) : null;
  }

  public register<TPlugin extends LabPlugin>(plugin: TPlugin): PluginHandle<TPlugin> {
    const catalog = this.#catalog;
    const byName = this.#byName;
    const scope = this.#scope;

    catalog.set(plugin.id, plugin);
    byName.set(plugin.name, plugin.id);
    scope.add(plugin.scope);

    return {
      pluginId: plugin.id,
      pluginName: plugin.name,
      plugin,
      [Symbol.dispose](): void {
        catalog.delete(plugin.id);
        byName.delete(plugin.name);
        scope.delete(plugin.scope);
      },
    };
  }

  public remove(pluginId: LabPluginId): boolean {
    const plugin = this.#catalog.get(pluginId);
    if (!plugin) {
      return false;
    }
    this.#catalog.delete(pluginId);
    this.#byName.delete(plugin.name);
    this.#scope.delete(plugin.scope);
    return true;
  }

  public resolveOrder(): readonly LabPlugin[] {
    const plugins = this.list();
    const ordered: LabPlugin[] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const visit = (plugin: LabPlugin): void => {
      if (stack.has(plugin.id)) throw new Error(`cycle at ${plugin.id}`);
      if (visited.has(plugin.id)) return;
      stack.add(plugin.id);

      for (const dependency of plugin.dependencies) {
        const dependencyPlugin = this.#catalog.get(dependency);
        if (dependencyPlugin) {
          visit(dependencyPlugin);
        }
      }

      stack.delete(plugin.id);
      visited.add(plugin.id);
      ordered.push(plugin);
    };

    for (const plugin of plugins) {
      visit(plugin);
    }

    return ordered;
  }

  public async executeSequence<TInput, TOutput = TInput>(
    plugins: readonly LabPlugin[],
    input: TInput,
    context: Omit<LabPluginContext, 'scope' | 'stage'> & { readonly stage: LabPlugin['stage']; readonly scope: LabPlugin['scope'] },
    emit: (event: LabRuntimeEvent) => Promise<void>,
  ): Promise<TOutput> {
    let current: unknown = input;
    for (const plugin of plugins) {
      const startedAt = new Date().toISOString();
      await emit({
        kind: 'plugin.started',
        pluginId: plugin.id,
        stage: plugin.stage,
        startedAt,
        details: {
          name: plugin.name,
          scope: plugin.scope,
        },
      });
      const pluginContext: LabPluginContext = {
        ...context,
        scope: plugin.scope,
        stage: plugin.stage,
      };
      const before = Date.parse(startedAt);
      try {
        current = await plugin.run(current, pluginContext);
      } catch (error) {
        await emit({
          kind: 'plugin.failed',
          pluginId: plugin.id,
          stage: plugin.stage,
          failedAt: new Date().toISOString(),
          error: `${error}`,
          details: { name: plugin.name },
        });
        this.#history.push({
          runId: context.runId,
          pluginId: plugin.id,
          pluginName: plugin.name,
          startedAt,
          completedAt: new Date().toISOString(),
          ok: false,
        });
        throw error;
      }

      const completedAt = new Date().toISOString();
      const durationMs = Date.parse(completedAt) - before;
      this.#history.push({
        runId: context.runId,
        pluginId: plugin.id,
        pluginName: plugin.name,
        startedAt,
        completedAt,
        ok: true,
      });
      await emit({
        kind: 'plugin.completed',
        pluginId: plugin.id,
        stage: plugin.stage,
        completedAt,
        durationMs,
        details: { name: plugin.name, outputType: typeof current },
      });
    }

    return current as TOutput;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#catalog.clear();
    this.#byName.clear();
    this.#scope.clear();
    this.#history.length = 0;
  }
}
