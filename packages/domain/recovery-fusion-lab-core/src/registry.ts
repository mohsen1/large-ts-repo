import { fail, ok, type Result } from '@shared/result';

import type {
  LabPlugin,
  LabPluginContext,
  PluginInputFor,
  PluginNameFromPlugins,
} from './plugin-contract';

export interface RegistrySnapshot<TPlugins extends readonly LabPlugin[]> {
  readonly names: readonly string[];
  readonly count: number;
  readonly manifestList: ReadonlyArray<PluginNameFromPlugins<TPlugins>>;
  readonly plugins: TPlugins;
}

export type RegistryRunInput<TPlugins extends readonly LabPlugin[], TName extends PluginNameFromPlugins<TPlugins>> =
  PluginInputFor<TPlugins, TName>;

export type RegistryRunOutput<TPlugins extends readonly LabPlugin[], TName extends PluginNameFromPlugins<TPlugins>> =
  unknown;

export class FusionLabPluginRegistry<TPlugins extends readonly LabPlugin[]> {
  readonly #plugins: Map<string, LabPlugin>;
  readonly #pluginsInOrder: TPlugins;

  private constructor(plugins: TPlugins) {
    this.#plugins = new Map();
    this.#pluginsInOrder = plugins;
    for (const plugin of plugins) {
      this.#plugins.set(plugin.manifest.name, plugin);
    }
  }

  static create<TPlugins extends readonly LabPlugin[]>(plugins: TPlugins): FusionLabPluginRegistry<TPlugins> {
    return new FusionLabPluginRegistry(plugins);
  }

  get names(): readonly PluginNameFromPlugins<TPlugins>[] {
    return [...this.#plugins.keys()] as readonly PluginNameFromPlugins<TPlugins>[];
  }

  get size(): number {
    return this.#plugins.size;
  }

  plugin<TName extends PluginNameFromPlugins<TPlugins>>(name: TName): TPlugins[number] | undefined {
    return this.#plugins.get(name as unknown as string) as TPlugins[number] | undefined;
  }

  async runByName<TName extends PluginNameFromPlugins<TPlugins>>(
    name: TName,
    input: RegistryRunInput<TPlugins, TName>,
    context: LabPluginContext,
  ): Promise<Result<RegistryRunOutput<TPlugins, TName>, Error>> {
    const plugin = this.plugin(name);
    if (!plugin) {
    return fail(new Error(`lab plugin missing: ${String(name)}`));
    }

    const startedAt = Date.now();
    try {
      const configured = await plugin.configure(context);
      const output = await plugin.execute(configured as RegistryRunInput<TPlugins, TName>, context);
      const elapsedMs = Date.now() - startedAt;
      void elapsedMs;
      return ok(output as RegistryRunOutput<TPlugins, TName>);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('plugin execution failure'));
    }
  }

  snapshot(): RegistrySnapshot<TPlugins> {
    return {
      names: this.names as readonly string[],
      count: this.size,
      manifestList: this.names,
      plugins: this.#pluginsInOrder,
    };
  }

  [Symbol.iterator](): IterableIterator<TPlugins[number]> {
    return this.#pluginsInOrder[Symbol.iterator]();
  }

  async close(): Promise<void> {
    const plugins = Array.from(this.#plugins.values()) as readonly LabPlugin[];
    for (const plugin of plugins) {
      await plugin.dispose?.();
    }
    this.#plugins.clear();
  }

  [Symbol.dispose](): void {
    void this.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

export const buildOrderedRun = <TPlugins extends readonly LabPlugin[]>(plugins: TPlugins): TPlugins =>
  Object.freeze([...plugins].sort((left, right) => right.manifest.priority - left.manifest.priority)) as TPlugins;

export const collectManifests = <TPlugins extends readonly LabPlugin[]>(
  registry: FusionLabPluginRegistry<TPlugins>,
): TPlugins => registry.snapshot().plugins;
