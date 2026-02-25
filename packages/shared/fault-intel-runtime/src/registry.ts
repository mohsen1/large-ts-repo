import { createIteratorChain, topologicalByWeight } from './iterator';
import type {
  AsyncScope,
  FaultIntelPlugin,
  PluginContext,
  PluginInvocation,
  NoInfer,
} from './types';

type PluginRecord<TContext extends PluginContext, TInput, TOutput, TConfig> = {
  plugin: FaultIntelPlugin<TContext, TInput, TOutput, TConfig>;
  addedAt: string;
};

export interface RegistryFilters<TContext extends PluginContext> {
  readonly stage?: string;
  readonly capability?: string;
  readonly minPriority?: number;
  readonly maxPriority?: number;
  readonly predicate?: (plugin: FaultIntelPlugin<TContext, unknown, unknown, unknown>) => boolean;
}

export class PluginLease implements AsyncScope {
  constructor(
    private readonly registry: FaultIntelRegistry<PluginContext>,
    private readonly id: string,
    private readonly contextKind: string,
  ) {}
  [Symbol.asyncDispose](): Promise<void> {
    this.registry.unregister(this.contextKind, this.id);
    return Promise.resolve();
  }
  [Symbol.dispose](): void {
    void this.registry.unregister(this.contextKind, this.id);
  }
}

export class FaultIntelRegistry<TContext extends PluginContext> {
  private readonly buckets = new Map<string, Map<string, PluginRecord<TContext, unknown, unknown, unknown>>>();

  public register<
    TInput,
    TOutput,
    TConfig,
    TPlugin extends FaultIntelPlugin<TContext, TInput, TOutput, TConfig>
  >(plugin: TPlugin, namespace: string): {
    plugin: TPlugin;
    readonly scope: AsyncScope;
  } {
    const byNamespace = this.buckets.get(namespace) ?? new Map<string, PluginRecord<TContext, unknown, unknown, unknown>>();
    byNamespace.set(plugin.id, {
      plugin: plugin as PluginRecord<TContext, unknown, unknown, unknown>['plugin'],
      addedAt: new Date().toISOString(),
    });
    this.buckets.set(namespace, byNamespace);

    return {
      plugin,
      scope: new PluginLease(this, plugin.id, namespace),
    };
  }

  public unregister(namespace: string, pluginId: string): void {
    const byNamespace = this.buckets.get(namespace);
    if (byNamespace) {
      byNamespace.delete(pluginId);
    }
  }

  public *entries(namespace: string): IterableIterator<FaultIntelPlugin<TContext, unknown, unknown, unknown>> {
    const bucket = this.buckets.get(namespace);
    if (!bucket) {
      return;
    }

    const list = [...bucket.values()];
    const sorted = topologicalByWeight(list.map((entry) => ({ weight: entry.plugin.priority, plugin: entry.plugin })));

    for (const plugin of sorted) {
      yield plugin.plugin;
    }
  }

  public list(namespace: string): readonly string[] {
    return [...this.entries(namespace)].map((plugin) => plugin.id);
  }

  public scope(namespace: string, pluginId: string): AsyncScope {
    return new PluginLease(this, pluginId, namespace);
  }

  private matches<T extends FaultIntelPlugin<TContext, unknown, unknown, unknown>>(
    plugin: T,
    filters?: RegistryFilters<TContext>,
  ): boolean {
    if (!filters) {
      return true;
    }
    if (filters.stage && plugin.stage !== filters.stage) {
      return false;
    }
    if (filters.minPriority !== undefined && plugin.priority < filters.minPriority) {
      return false;
    }
    if (filters.maxPriority !== undefined && plugin.priority > filters.maxPriority) {
      return false;
    }
    if (filters.capability && !plugin.supports.includes(filters.capability)) {
      return false;
    }
    if (filters.predicate && !filters.predicate(plugin as FaultIntelPlugin<TContext, unknown, unknown, unknown>)) {
      return false;
    }
    return true;
  }

  public async executePipeline<
    TSeed,
  >(
    namespace: string,
    seed: TSeed,
    context: NoInfer<TContext>,
    filters?: RegistryFilters<TContext>,
  ): Promise<{
    readonly diagnostics: readonly PluginInvocation<TContext, TSeed, unknown>[];
    readonly value: TSeed;
  }> {
    const diagnostics: PluginInvocation<TContext, TSeed, unknown>[] = [];
    let value: TSeed = seed;
    const plugins = [...this.entries(namespace)].filter((plugin) => this.matches(plugin, filters));

    for (const plugin of plugins) {
      const started = performance.now();
      const output = await plugin.execute(context, value as never);
      const ended = performance.now();
      diagnostics.push({
        pluginId: plugin.id,
        context,
        input: value,
        output,
        elapsedMs: Math.round(ended - started),
      });

      if (output !== undefined && output !== null) {
        value = output as TSeed;
      }
    }

    return {
      diagnostics: createIteratorChain(diagnostics).toArray(),
      value,
    };
  }
}

export const createSharedRegistry = <TContext extends PluginContext>(): FaultIntelRegistry<TContext> =>
  new FaultIntelRegistry<TContext>();
