import type { NoInfer } from '@shared/type-level';
import {
  type RuntimePlugin,
  type RuntimePluginInput,
  type RuntimePluginOutput,
  Registry,
  registerPlugins,
  pluginByName,
  type PluginSelector,
} from '@shared/recovery-orchestration-lab-runtime';

type PluginFactory<T extends string, TInput, TOutput> = (id: T) => RuntimePlugin<T, TInput, TOutput>;

export type PluginSet = readonly RuntimePlugin<string, unknown, unknown>[];

export interface RuntimeDomainRegistry<TPlugins extends PluginSet> {
  readonly plugins: Registry<TPlugins>;
  readonly run: (name: PluginSelector<TPlugins>, input: NoInfer<unknown>) => Promise<RuntimePluginOutput<unknown>>;
  readonly scope: <T>(name: string, payload: T) => T;
}

export const createDomainRegistry = <TPlugins extends PluginSet>(plugins: TPlugins): RuntimeDomainRegistry<TPlugins> => {
  const registry = registerPlugins(plugins);

  const run = async (name: PluginSelector<TPlugins>, input: NoInfer<unknown>): Promise<RuntimePluginOutput<unknown>> => {
    const plugin = pluginByName(registry, name);
    const runtimeInput: RuntimePluginInput<unknown> = {
      traceId: `trace:${Date.now()}`,
      payload: input,
      context: {
        tenant: 'tenant:global',
        workspace: 'ws:global',
        runId: 'run:global',
        startedAt: new Date(),
      },
    };
    return plugin.run(runtimeInput);
  };

  return {
    plugins: registry,
    run,
    scope: <T>(name: string, payload: T): T => {
      const plugin = registry.get(name);
      if (!plugin) {
        throw new Error(`scope plugin missing ${name}`);
      }
      return payload;
    },
  };
};

export const registerPluginFactory = <
  T extends string,
  TInput,
  TOutput,
>(factory: PluginFactory<T, TInput, TOutput>): RuntimePlugin<T, TInput, TOutput> => {
  return factory(Math.random().toString(36).slice(2) as T);
};

export const bootstrapDomainRegistry = <TPlugins extends PluginSet>(plugins: TPlugins): RuntimeDomainRegistry<TPlugins> => {
  return createDomainRegistry(plugins);
};
