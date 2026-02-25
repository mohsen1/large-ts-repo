import { toMap } from '@shared/typed-orchestration-core';
import { NoInfer } from '@shared/type-level';
import {
  type PluginByName,
  type PluginDefinition,
  type PluginName,
} from './plugins';

class PluginStepScope {
  private disposed = false;

  public constructor(
    private readonly plugin: PluginName,
    private readonly context: Readonly<{ runId: string }>,
  ) {}

  public [Symbol.dispose](): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    void this.context.runId;
    void this.plugin;
  }
}

class PluginAsyncScope {
  private disposed = false;

  public constructor(
    private readonly plugin: PluginName,
    private readonly startedAt: number,
  ) {}

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await Promise.resolve(this.startedAt + this.plugin.length);
  }
}

export class RegistryError extends Error {
  public readonly code = 'quantum-studio-registry-error';

  public constructor(message: string, public readonly context: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

export type RegistryOrder<TPlugins extends readonly PluginDefinition<any, any, any, any>[]> = {
  readonly order: readonly PluginName[];
  readonly map: ReadonlyMap<PluginName, PluginDefinition<any, any, any, any>>;
};

export const computeOrder = <
  TPlugins extends readonly PluginDefinition<any, any, any, any>[],
>(plugins: TPlugins): RegistryOrder<TPlugins> => {
  const map = new Map<PluginName, PluginDefinition<any, any, any, any>>();
  const indegree = new Map<PluginName, number>();

  for (const plugin of plugins) {
    map.set(plugin.name, plugin);
    indegree.set(plugin.name, plugin.dependsOn.length);
  }

  const adjacency = new Map<PluginName, PluginName[]>();
  for (const plugin of plugins) {
    for (const dependency of plugin.dependsOn) {
      adjacency.set(dependency, [...(adjacency.get(dependency) ?? []), plugin.name]);
    }
  }

  const order: PluginName[] = [];
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([name]) => name);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    order.push(current);

    for (const successor of adjacency.get(current) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) {
        queue.push(successor);
      }
    }
  }

  if (order.length !== map.size) {
    throw new RegistryError('Unresolved plugin dependency cycle detected', 'computeOrder');
  }

  return { order, map };
};

export class QuantumPluginRegistry<
  const TPlugins extends readonly PluginDefinition<any, any, any, any>[],
> {
  readonly #nameMap: ReadonlyMap<PluginName, PluginDefinition<any, any, any, any>>;
  readonly #order: readonly PluginName[];

  public constructor(plugins: NoInfer<TPlugins>) {
    const computed = computeOrder(plugins);
    this.#nameMap = computed.map;
    this.#order = computed.order;
  }

  public names(): readonly PluginName[] {
    return this.#order;
  }

  public has(name: PluginName): boolean {
    return this.#nameMap.has(name);
  }

  public get<TName extends PluginName>(
    name: TName,
  ): PluginByName<TPlugins, Extract<TName, string>> | undefined {
    return this.#nameMap.get(name) as PluginByName<TPlugins, Extract<TName, string>> | undefined;
  }

  public all(): Readonly<Record<PluginName, PluginDefinition<any, any, any, any>>> {
    return Object.fromEntries(this.#nameMap.entries()) as Readonly<
      Record<PluginName, PluginDefinition<any, any, any, any>>
    >;
  }

  public namespaces(): readonly string[] {
    const values = Array.from(this.#nameMap.values());
    const map = toMap(values, (entry) => entry.namespace);
    return Array.from(map.keys());
  }

  public async run<TName extends PluginName>(
    name: TName,
    input: unknown,
    context: {
      readonly tenant: `tenant:${string}`;
      readonly node: `node:${string}`;
    },
  ): Promise<unknown> {
    const runtimeStack = new AsyncDisposableStack();
    try {
      let payload: unknown = input;

      for (const pluginName of this.#order) {
        const plugin = this.get(pluginName);
        if (!plugin) {
          throw new RegistryError(`Missing plugin definition: ${pluginName}`, 'run');
        }

        using _scope = new PluginStepScope(plugin.name, { runId: context.node });

        runtimeStack.use(new PluginAsyncScope(plugin.name, Date.now()));

        const outcome = await plugin.run(payload as never, {
          runId: `run:${context.node}:${context.tenant}` as const,
          tenant: context.tenant,
          node: context.node,
          metadata: {
            kind: plugin.kind,
            namespace: plugin.namespace,
            name: plugin.name,
            tags: plugin.tags,
          },
        });

        if (outcome.status === 'error') {
          throw new RegistryError(`Plugin failure ${plugin.name}`, `plugin:${plugin.name}`);
        }

        if (!outcome.skipped && outcome.payload !== null) {
          payload = outcome.payload;
        }

        if (pluginName === name) {
            return payload;
        }
      }

      if (this.has(name)) {
        return payload;
      }

      throw new RegistryError(`No matching plugin output for ${name}`, 'run');
    } finally {
      await runtimeStack.disposeAsync();
    }
  }
}

export const validateRegistry = <
  TPlugins extends readonly PluginDefinition<any, any, any, any>[],
>(plugins: NoInfer<TPlugins>): QuantumPluginRegistry<TPlugins> => {
  computeOrder(plugins);
  return new QuantumPluginRegistry(plugins);
};
