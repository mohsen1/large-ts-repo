import type { NoInfer } from '@shared/type-level';
import type {
  PluginContext,
  PluginDefinition,
  PluginOutput,
  PluginNameUnion,
  PluginByName,
  SynthesisPluginName,
  SynthesisTraceId,
  StageName,
} from './types';
import { createSignedTrace } from './contracts';

export interface RegistryRunMetadata {
  readonly namespace: string;
  readonly namespaceVersion: string;
  readonly pluginCount: number;
}

export interface RegistryProbe<TInput> {
  readonly input: TInput;
  readonly diagnostics: readonly string[];
}

export class SynthesisPluginRegistry<TPlugins extends readonly PluginDefinition[]> {
  readonly #plugins: TPlugins;
  readonly #definitions = new Map<SynthesisPluginName, PluginDefinition>();

  constructor(plugins: TPlugins) {
    this.#plugins = plugins;
    for (const plugin of plugins) {
      this.#definitions.set(plugin.name, plugin);
    }
  }

  all(): readonly TPlugins[number][] {
    return this.#plugins;
  }

  get names(): readonly SynthesisPluginName[] {
    return [...this.#definitions.keys()];
  }

  find<TName extends PluginNameUnion<TPlugins>>(name: TName): PluginByName<TPlugins, TName> | undefined {
    return this.#definitions.get(name) as PluginByName<TPlugins, TName> | undefined;
  }

  has(name: SynthesisPluginName): boolean {
    return this.#definitions.has(name);
  }

  ordered(): readonly SynthesisPluginName[] {
    const all = [...this.#definitions.entries()].map(([name, plugin]) => ({ name, deps: plugin.dependsOn }));
    const byName = new Map(all.map((entry) => [entry.name, entry.deps]));
    const visiting = new Set<SynthesisPluginName>();
    const visited = new Set<SynthesisPluginName>();
    const order: SynthesisPluginName[] = [];

    const visit = (target: SynthesisPluginName): void => {
      if (visited.has(target)) {
        return;
      }
      if (visiting.has(target)) {
        throw new Error(`circular plugin dependency for ${target}`);
      }
      const deps = byName.get(target);
      if (!deps) {
        return;
      }
      visiting.add(target);
      for (const dependency of deps) {
        visit(dependency);
      }
      visiting.delete(target);
      visited.add(target);
      order.push(target);
    };

    for (const { name } of all) {
      visit(name);
    }
    return order;
  }

  dependencyGraph(): readonly [SynthesisPluginName, readonly SynthesisPluginName[]][] {
    return [...this.#plugins].map((plugin) => [plugin.name, plugin.dependsOn]);
  }

  async execute<TName extends PluginNameUnion<TPlugins>, TInput>(
    name: TName,
    input: NoInfer<TInput>,
    context: Omit<PluginContext<TInput>, 'input' | 'plugin'>,
  ): Promise<PluginByName<TPlugins, TName> extends PluginDefinition<unknown, infer TOutput, any, any, any>
    ? PluginOutput<TOutput>
    : PluginOutput<unknown>> {
    const plugin = this.find(name);
    if (!plugin) {
      throw new Error(`unknown plugin ${name}`);
    }

    const pluginContext: PluginContext<TInput> = {
      traceId: context.traceId ?? (createSignedTrace('default', `${name}-${Date.now()}`) as SynthesisTraceId),
      plugin: name,
      stage: context.stage,
      sequence: context.sequence ?? 0,
      startedAt: context.startedAt ?? new Date().toISOString(),
      input,
      metadata: context.metadata,
    };

    return plugin.run(input, pluginContext) as Promise<
      PluginByName<TPlugins, TName> extends PluginDefinition<unknown, infer TOutput, any, any, any>
        ? PluginOutput<TOutput>
        : PluginOutput<unknown>
    >;
  }

  probe(input: unknown): RegistryProbe<unknown> {
    return {
      input,
      diagnostics: [this.#plugins.length > 1 ? 'multi-step registry' : 'single plugin'],
    };
  }
}
