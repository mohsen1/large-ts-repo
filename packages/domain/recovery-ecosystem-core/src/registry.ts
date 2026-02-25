import {
  asDependencies,
  type EcosystemPlugin,
  EcosystemPluginRegistry,
  type PluginInputMap,
  type PluginInputByName,
  PluginOutput,
  PluginOutputMap,
  type PluginContext,
} from './plugin-contract';
import type { NoInfer, PluginName } from '@shared/typed-orchestration-core';
import type { JsonValue } from '@shared/type-level';

export interface PluginDescriptor {
  readonly id: string;
  readonly namespace: string;
  readonly dependsOn: readonly string[];
  readonly tags: readonly string[];
}

export type PluginCatalog<TPlugins extends readonly EcosystemPlugin[]> = {
  readonly plugins: TPlugins;
  readonly byId: {
    [K in TPlugins[number] as K['name']]: PluginDescriptor;
  };
};

const buildDescriptor = <TPlugins extends readonly EcosystemPlugin[]>(
  plugin: TPlugins[number],
): PluginDescriptor => ({
  id: plugin.name,
  namespace: plugin.namespace,
  dependsOn: plugin.dependsOn,
  tags: [...plugin.tags],
});

export const buildCatalog = <TPlugins extends readonly EcosystemPlugin[]>(
  plugins: TPlugins,
): PluginCatalog<TPlugins> => {
  const byId = plugins.reduce(
    (accumulator, plugin) => ({
      ...accumulator,
      [plugin.name]: buildDescriptor<TPlugins>(plugin),
    }),
    {} as PluginCatalog<TPlugins>['byId'],
  );

  return {
    plugins,
    byId,
  };
};

export type PluginInputType<TPlugins extends readonly EcosystemPlugin[]> = PluginInputMap<TPlugins>;
export type PluginOutputType<TPlugins extends readonly EcosystemPlugin[]> = PluginOutputMap<TPlugins>;

export const pluginOrder = <TPlugins extends readonly EcosystemPlugin[]>(
  registry: EcosystemPluginRegistry<TPlugins>,
): readonly PluginName[] => registry.names();

const invoke = async <TPlugins extends readonly EcosystemPlugin[]>(
  registry: EcosystemPluginRegistry<TPlugins>,
  plan: PluginInputMap<TPlugins> & { readonly __planScope?: string },
): Promise<Partial<PluginOutputType<TPlugins>>> => {
  const outputs = {} as Partial<PluginOutputType<TPlugins>>;
  const order = registry.resolveOrder();

  for (const name of order) {
    const pluginInput = plan[name as keyof typeof plan] as NoInfer<PluginInputByName<TPlugins, typeof name>>;
    const result = await registry.run(name as never, pluginInput, {
      runId: `run:${name}` as any,
      tenant: `tenant:${name}` as any,
      step: name,
      correlation: {
        runId: `run:${name}` as any,
        tenant: `tenant:${name}` as any,
      },
      input: pluginInput,
    } as unknown as PluginContext<JsonValue>);
    const key = name as keyof PluginOutputType<TPlugins>;
    outputs[key] = result as unknown as PluginOutputType<TPlugins>[keyof PluginOutputType<TPlugins>];
  }

  return outputs;
};

export const runCatalog = <TPlugins extends readonly EcosystemPlugin[]>(
  registry: EcosystemPluginRegistry<TPlugins>,
  inputs: PluginInputMap<TPlugins>,
): Promise<{
  readonly outputs: PluginOutputType<TPlugins>;
  readonly dependencies: Record<PluginName, readonly string[]>;
}> =>
  invoke(registry, inputs as PluginInputMap<TPlugins> & { readonly __planScope?: string }).then((outputs) => ({
    outputs: outputs as PluginOutputType<TPlugins>,
    dependencies: Object.fromEntries(
      pluginOrder(registry).map((name) => [name, asDependencies<TPlugins>()(registry, name as never)]),
    ) as Record<PluginName, readonly string[]>,
  }));

export const isReadyName = <TPlugins extends readonly EcosystemPlugin[]>(
  name: PluginName,
  catalog: PluginCatalog<TPlugins>,
): name is keyof PluginCatalog<TPlugins>['byId'] => name in catalog.byId;
