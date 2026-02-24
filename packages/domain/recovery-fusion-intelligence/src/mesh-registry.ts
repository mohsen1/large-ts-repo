import { fail, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import {
  type MeshManifestEntry,
  type MeshPlugin,
  type MeshPluginContext,
  type MeshPluginInputShape,
  type MeshPluginName,
  type MeshPluginId,
  type MeshRunId,
  type MeshPolicy,
  type MeshNode,
  type MeshSignalEnvelope,
} from './mesh-types';

interface RegistryRecord {
  readonly manifest: MeshManifestEntry;
  readonly plugin: MeshPlugin;
}

type PluginInputForName<TName extends MeshPluginName> =
  Extract<MeshPlugin, { readonly manifest: { readonly name: TName } }> extends infer TPlugin
    ? TPlugin extends { readonly run: (input: infer Input, context: MeshPluginContext) => Promise<infer Output> }
      ? [Input, Output]
      : never
    : never;

export interface MeshRegistryOptions {
  readonly plugins?: readonly MeshPlugin[];
  readonly strict?: boolean;
}

export class MeshPluginRegistry {
  #records = new Map<MeshPluginName, RegistryRecord>();

  private constructor(
    private readonly plugins: readonly MeshPlugin[],
    private readonly strict: boolean,
  ) {
    for (const plugin of plugins) {
      this.#records.set(plugin.manifest.name, { manifest: plugin.manifest, plugin });
    }
  }

  static create(config?: MeshRegistryOptions): MeshPluginRegistry {
    return new MeshPluginRegistry(config?.plugins ?? [], config?.strict ?? false);
  }

  static createWithEntries(plugins: readonly MeshPlugin[]): MeshPluginRegistry {
    return new MeshPluginRegistry(plugins, false);
  }

  has(pluginName: MeshPluginName): boolean {
    return this.#records.has(pluginName);
  }

  get pluginNames(): readonly MeshPluginName[] {
    return [...this.#records.keys()];
  }

  get size(): number {
    return this.#records.size;
  }

  get(pluginName: MeshPluginName): MeshPlugin | undefined {
    return this.#records.get(pluginName)?.plugin;
  }

  get pluginIds(): readonly MeshPluginId[] {
    return [...this.#records.values()].map((entry) => entry.manifest.pluginId);
  }

  add(plugin: MeshPlugin): Result<void, Error> {
    if (this.strict && this.#records.has(plugin.manifest.name)) {
      return fail(new Error(`plugin already exists: ${plugin.manifest.name}`));
    }
    this.#records.set(plugin.manifest.name, { manifest: plugin.manifest, plugin });
    return ok(undefined);
  }

  async runByName<TName extends MeshPluginName>(
    pluginName: TName,
    input: NoInfer<PluginInputForName<TName>[0]>,
    context: MeshPluginContext,
  ): Promise<Result<PluginInputForName<TName>[1], Error>> {
    const record = this.#records.get(pluginName);
    if (!record) {
      return fail(new Error(`unknown plugin: ${pluginName}`));
    }

    try {
      const output = await record.plugin.run(input, context);
      return ok(output as PluginInputForName<TName>[1]);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('mesh plugin run failed'));
    }
  }

  manifestSnapshot(): readonly MeshManifestEntry[] {
    return [...this.#records.values()].map((record) => record.manifest);
  }

  close(): void {
    for (const record of this.#records.values()) {
      void Promise.resolve(record.plugin.dispose?.());
    }

    this.#records.clear();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.close();
    return Promise.resolve();
  }
}

export const pluginManifestMap = <TPlugins extends readonly MeshManifestEntry[]>(
  plugins: TPlugins,
): Readonly<Record<TPlugins[number]['name'], TPlugins[number]>> => {
  return Object.freeze(
    plugins.reduce<Record<TPlugins[number]['name'], TPlugins[number]>>(
      (acc, plugin) => ({
        ...acc,
        [plugin.name]: plugin,
      }),
      {} as Record<TPlugins[number]['name'], TPlugins[number]>,
    ),
  );
};

export const buildPhaseSignals = (
  runId: MeshRunId,
  phase: import('./mesh-types').MeshPhase,
  source: MeshNode,
  nodes: readonly MeshNode[],
): readonly MeshSignalEnvelope[] =>
  nodes.map((node, index) => ({
    id: `${runId}:signal:${phase}:${index}` as import('./mesh-types').MeshEventId,
    phase,
    source: node.id,
    target: source.id,
    class: 'baseline',
    severity: node.score >= 4 ? (4 as import('./mesh-types').MeshPriority) : (1 as import('./mesh-types').MeshPriority),
    payload: { phase, index },
    createdAt: new Date().toISOString(),
  }));
