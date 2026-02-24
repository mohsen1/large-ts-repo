import { type Brand, type TupleOf, type OptionalKeys } from '@shared/core';
import type { NoInfer, Predicate } from '@shared/type-level';
import {
  type MeshEventEnvelope,
  type MeshNodeConfig,
  type MeshPlanId,
  type MeshRunId,
  type MeshSignalKind,
  type MeshTopology,
} from './types';

export type MeshPluginName<T extends string> = `@mesh/${T}`;
export type MeshPluginId<T extends string> = Brand<string, `mesh-plugin-${T}`>;

export interface MeshPluginContext<TState extends Record<string, unknown> = Record<string, unknown>> {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly state: TState;
  readonly startedAt: number;
  readonly logger: (...message: readonly string[]) => void;
}

export interface MeshPluginResult<TPayload> {
  readonly status: 'ok' | 'skip' | 'error';
  readonly payload?: TPayload;
  readonly reason?: string;
}

export interface MeshPluginHandle<TInput, TOutput, TName extends string = string> {
  readonly id: MeshPluginId<TName>;
  readonly name: MeshPluginName<TName>;
  readonly version: `${number}.${number}.${number}`;
  readonly dependsOn: readonly MeshPluginId<string>[];
  readonly supports: readonly MeshSignalKind[];
  canRun(input: TInput, context: MeshPluginContext): boolean;
  run(input: TInput, context: MeshPluginContext): Promise<MeshPluginResult<TOutput>>;
}

export type MeshPluginSpec<TPlugins extends readonly MeshPluginHandle<any, any, string>[]> = {
  readonly plugins: NoInfer<TPlugins>;
  readonly namespace: Brand<string, 'mesh-plugin-spec'>;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type MeshPluginRecord<TPlugins extends readonly MeshPluginHandle<any, any, string>[]> = {
  [T in TPlugins[number] as T['id']]: T;
};

export type PluginCapabilities<TPlugin> = TPlugin extends MeshPluginHandle<infer _In, infer _Out, infer Name>
  ? {
      readonly id: MeshPluginId<Name & string>;
      readonly supports: readonly MeshSignalKind[];
      readonly name: MeshPluginName<Name & string>;
    }
  : never;

export type MeshEmitter<TSignal extends MeshSignalKind, TPayload = unknown> = (
  event: Readonly<Pick<MeshEventEnvelope<TSignal, TPayload>, 'id' | 'kind' | 'payload' | 'trace'>>
) => void;

export interface MeshPluginRegistry<TPlugins extends readonly MeshPluginHandle<any, any, string>[]> extends AsyncDisposable {
  readonly namespace: Brand<string, 'mesh-plugin-registry'>;
  all(): MeshPluginRecord<TPlugins>;
  get<TPluginName extends TPlugins[number]['id']>(id: TPluginName):
    | Extract<TPlugins[number], { id: TPluginName }>
    | undefined;
  register<TName extends string, TInput, TOutput>(
    plugin: MeshPluginHandle<TInput, TOutput, TName>,
  ): MeshPluginRegistry<[...TPlugins, MeshPluginHandle<TInput, TOutput, TName>]>;
  runBySignal<TSignal extends MeshSignalKind>(
    signal: TSignal,
    handler: (plugin: Extract<TPlugins[number], { supports: readonly MeshSignalKind[] }>) => Promise<void> | void,
  ): Promise<void>;
}

export type RegistryStats = {
  readonly size: number;
  readonly pluginsBySignal: Record<MeshSignalKind, number>;
};

class InternalMeshPluginRegistry<TPlugins extends readonly MeshPluginHandle<any, any, string>[]> {
  readonly #plugins = new Map<string, TPlugins[number]>();
  readonly #name: Brand<string, 'mesh-plugin-registry'>;
  #disposed = false;

  constructor(spec: MeshPluginSpec<TPlugins>) {
    this.#name = (spec.namespace as unknown as Brand<string, 'mesh-plugin-registry'>);
    for (const plugin of spec.plugins) {
      this.#plugins.set(plugin.id as string, plugin);
    }
  }

  get namespace() {
    return this.#name;
  }

  all(): MeshPluginRecord<TPlugins> {
    const out = {} as MeshPluginRecord<TPlugins>;
    for (const [id, plugin] of this.#plugins) {
      (out as Record<string, TPlugins[number]>)[id] = plugin;
    }
    return out;
  }

  get<TPluginName extends TPlugins[number]['id']>(
    id: TPluginName,
  ): Extract<TPlugins[number], { id: TPluginName }> | undefined {
    return this.#plugins.get(id as string) as Extract<TPlugins[number], { id: TPluginName }> | undefined;
  }

  register<TName extends string, TInput, TOutput>(
    plugin: MeshPluginHandle<TInput, TOutput, TName>,
  ): MeshPluginRegistry<[...TPlugins, MeshPluginHandle<TInput, TOutput, TName>]> {
    if (this.#disposed) {
      throw new Error('registry is disposed');
    }
    this.#plugins.set(plugin.id, plugin as TPlugins[number]);
    return this as unknown as MeshPluginRegistry<[
      ...TPlugins,
      MeshPluginHandle<TInput, TOutput, TName>,
    ]>;
  }

  async runBySignal<TSignal extends MeshSignalKind>(
    signal: TSignal,
    handler: (plugin: Extract<TPlugins[number], { supports: readonly MeshSignalKind[] }>) => Promise<void> | void,
  ): Promise<void> {
    if (this.#disposed) {
      throw new Error('registry is disposed');
    }

    const plugins = [...this.#plugins.values()] as TPlugins[number][];
    for (const plugin of plugins) {
      if (plugin.supports.includes(signal)) {
        await handler(plugin as Extract<TPlugins[number], { supports: readonly MeshSignalKind[] }>);
      }
    }
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#plugins.clear();
    return Promise.resolve();
  }

  stats(): RegistryStats {
    const pluginValues = [...this.#plugins.values()];
    return {
      size: pluginValues.length,
      pluginsBySignal: {
        pulse: pluginValues.filter((entry) => entry.supports.includes('pulse')).length,
        snapshot: pluginValues.filter((entry) => entry.supports.includes('snapshot')).length,
        alert: pluginValues.filter((entry) => entry.supports.includes('alert')).length,
        telemetry: pluginValues.filter((entry) => entry.supports.includes('telemetry')).length,
      },
    };
  }
}

export const createMeshPluginRegistry = <const TPlugins extends readonly MeshPluginHandle<any, any, string>[]>(
  plugins: TPlugins,
): MeshPluginRegistry<TPlugins> => {
  const spec = {
    namespace: `mesh:${Date.now()}` as Brand<string, 'mesh-plugin-spec'>,
    metadata: {},
    plugins,
  } as const;

  return new InternalMeshPluginRegistry(spec);
};

export const runPluginSequence = async <
  TPlugins extends readonly MeshPluginHandle<any, any, string>[],
  TInput,
  TOutput,
>(
  registry: MeshPluginRegistry<TPlugins>,
  input: TInput,
  context: MeshPluginContext,
): Promise<TOutput[]> => {
  const outputs: TOutput[] = [];
  await registry.runBySignal('pulse', (plugin) => {
    if (plugin.canRun(input as never, context)) {
      plugin.run(input as never, context).then((result) => {
        if (result.status === 'ok' && result.payload !== undefined) {
          outputs.push(result.payload as TOutput);
        }
      });
    }
  });

  return outputs;
};

export const normalizePluginSpec = <TPlugins extends readonly MeshPluginHandle<any, any, string>[]>(
  plugins: NoInfer<TPlugins>,
  transform: (id: string) => string = (value) => value,
): readonly string[] =>
  plugins
    .map((plugin) => plugin.id)
    .map((id) => transform(id));

export const pluginCaps = <TPlugin>(
  plugin: MeshPluginHandle<TPlugin extends never ? never : any, any, string>,
): PluginCapabilities<TPlugin> => {
  return {
    id: plugin.id,
    name: plugin.name,
    supports: plugin.supports,
  } as PluginCapabilities<TPlugin>;
};

export const describeRegistry = (registry: MeshPluginRegistry<readonly MeshPluginHandle<any, any, string>[]>) => {
  const all = registry.all();
  return {
    total: Object.keys(all).length,
    names: Object.keys(all),
    stats: 'ok',
  };
};

export const selectByTopology = <TNodes extends readonly MeshNodeConfig[]>(
  nodes: TNodes,
  predicate: Predicate<TNodes[number]>,
): TNodes => {
  const selected = nodes.filter((node): node is TNodes[number] => predicate(node));
  return selected as unknown as TNodes;
};

export const ensureAllDependencies = <TPlugins extends readonly MeshPluginHandle<any, any, string>[]>(
  plugin: MeshPluginHandle<any, any, string>,
  all: TPlugins,
): boolean => {
  const available = new Set(all.map((entry) => entry.id));
  return plugin.dependsOn.every((dependency) => available.has(dependency));
};

export const resolveTopologyPlugins = <TTopology extends MeshTopology>(
  topology: TTopology,
): TupleOf<string, 2> => {
  const keys = topology.nodes.map((node) => node.id);
  return [keys.at(0) ?? 'mesh-node-0', keys.at(1) ?? 'mesh-node-1'] as TupleOf<string, 2>;
};

export const stripOptionalFromTopology = <TTopology extends MeshTopology>(
  topology: TTopology,
): Omit<TTopology, OptionalKeys<TTopology>> => topology as Omit<TTopology, OptionalKeys<TTopology>>;
