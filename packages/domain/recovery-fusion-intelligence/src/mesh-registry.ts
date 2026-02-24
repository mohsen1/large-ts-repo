import { fail, ok, type Result } from '@shared/result';

import type {
  MeshManifestEntry,
  MeshPlugin,
  MeshPluginContext,
  MeshPluginId,
  MeshPluginName,
} from './mesh-types';

type PluginWithName<TName extends MeshPluginName> = Extract<MeshPlugin, { readonly manifest: { readonly name: TName } }>;
type InputForName<TName extends MeshPluginName> = PluginWithName<TName> extends MeshPlugin<infer I, unknown> ? I : never;
type OutputForName<TName extends MeshPluginName> = PluginWithName<TName> extends MeshPlugin<unknown, infer O> ? O : never;

export interface MeshRegistryOptions {
  readonly plugins?: readonly MeshPlugin[];
}

export class MeshPluginRegistry {
  private readonly byId = new Map<MeshPluginId, MeshPlugin>();
  private readonly byName = new Map<MeshPluginName, MeshPlugin>();
  private readonly ordered: MeshPlugin[] = [];

  private constructor(plugins: readonly MeshPlugin[] = []) {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  static create(config?: MeshRegistryOptions): MeshPluginRegistry {
    return new MeshPluginRegistry(config?.plugins ?? []);
  }

  static createWithEntries(plugins: readonly MeshPlugin[]): MeshPluginRegistry {
    return new MeshPluginRegistry(plugins);
  }

  get pluginNames(): readonly MeshPluginName[] {
    return [...this.byName.keys()];
  }

  get size(): number {
    return this.byId.size;
  }

  register(plugin: MeshPlugin): this {
    this.byId.set(plugin.manifest.pluginId, plugin);
    this.byName.set(plugin.manifest.name, plugin);
    this.ordered.push(plugin);
    return this;
  }

  has(pluginName: MeshPluginName): boolean {
    return this.byName.has(pluginName);
  }

  get<TName extends MeshPluginName>(pluginName: TName): PluginWithName<TName> | undefined {
    return this.byName.get(pluginName) as PluginWithName<TName> | undefined;
  }

  async runByName<TName extends MeshPluginName>(
    pluginName: TName,
    input: NoInfer<InputForName<TName>>,
    context: MeshPluginContext,
  ): Promise<Result<OutputForName<TName>, Error>> {
    const plugin = this.get(pluginName);
    if (!plugin) {
      return fail(new Error(`mesh plugin missing: ${pluginName}`));
    }
    try {
      return ok(await plugin.run(input as never, context) as OutputForName<TName>);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('plugin-run-failed'));
    }
  }

  *plugins(): IterableIterator<MeshPlugin> {
    for (const plugin of this.ordered) {
      yield plugin;
    }
  }

  manifestSnapshot(): MeshManifestEntry[] {
    return this.ordered.map((plugin) => plugin.manifest);
  }

  close(): void {
    for (const plugin of this.ordered) {
      void plugin.dispose?.();
    }
    this.byId.clear();
    this.byName.clear();
    this.ordered.length = 0;
  }
}
