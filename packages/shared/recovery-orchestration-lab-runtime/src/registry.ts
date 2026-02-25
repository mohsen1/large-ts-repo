import type { NoInfer } from '@shared/type-level';

export type PluginContractTag = `contract:${string}`;

export interface RuntimePluginMeta {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly PluginContractTag[];
  readonly version: `${number}.${number}.${number}`;
  readonly description?: string;
}

export interface RuntimePluginContext {
  readonly tenant: string;
  readonly workspace: string;
  readonly runId: string;
  readonly startedAt: Date;
}

export interface RuntimePluginInput<TPayload> {
  readonly traceId: string;
  readonly payload: TPayload;
  readonly context: RuntimePluginContext;
}

export interface RuntimePluginOutput<TOutput> {
  readonly traceId: string;
  readonly result: TOutput;
  readonly score: number;
}

export interface RuntimePlugin<TName extends string, TInput, TOutput> {
  readonly name: TName;
  readonly meta: RuntimePluginMeta;
  readonly canRun: (input: RuntimePluginInput<TInput>) => boolean;
  run(input: RuntimePluginInput<TInput>): Promise<RuntimePluginOutput<TOutput>>;
}

export type PluginRegistryRecord<T extends Record<string, RuntimePlugin<string, unknown, unknown>>> = {
  [K in keyof T]: T[K];
};

export type PluginSelector<TRegistry extends readonly RuntimePlugin<string, unknown, unknown>[]> =
  TRegistry[number]['name'];

export type InferInput<TRegistry extends readonly RuntimePlugin<string, unknown, unknown>[]> =
  TRegistry[number] extends RuntimePlugin<string, infer TInput, unknown> ? TInput : never;

export type InferOutput<TRegistry extends readonly RuntimePlugin<string, unknown, unknown>[]> =
  TRegistry[number] extends RuntimePlugin<string, unknown, infer TOutput> ? TOutput : never;

export class Registry<TPlugins extends readonly RuntimePlugin<string, unknown, unknown>[]> {
  #entries: Map<string, TPlugins[number]>;

  constructor(readonly plugins: TPlugins) {
    this.#entries = new Map<string, TPlugins[number]>(plugins.map((plugin) => [plugin.name, plugin]));
  }

  has(name: string): boolean {
    return this.#entries.has(name);
  }

  get(name: string): TPlugins[number] | undefined {
    return this.#entries.get(name);
  }

  select<
    const TSelection extends readonly (TPlugins[number]['name'])[],
  >(selection: [...TSelection]): { readonly [K in TSelection[number]]: PluginByName<this['plugins'][number], K> } {
    const map = {} as { [key: string]: RuntimePlugin<string, unknown, unknown> };
    for (const name of selection) {
      const plugin = this.get(name);
      if (!plugin) {
        throw new Error(`missing plugin ${name}`);
      }
      map[name] = plugin;
    }
    return map as never;
  }

  runSequential(input: unknown): Promise<{ readonly [K in PluginSelector<TPlugins>]: RuntimePluginOutput<unknown> }> {
    return (async () => {
      const outputs: Record<string, RuntimePluginOutput<unknown>> = {};
      for (const plugin of this.plugins) {
        const contextInput = {
          traceId: `trace:${Date.now()}`,
          payload: input,
          context: {
            tenant: 'tenant:global',
            workspace: 'ws:global',
            runId: 'run:global',
            startedAt: new Date(),
          },
        } as RuntimePluginInput<unknown>;
        if (!plugin.canRun(contextInput)) {
          continue;
        }
        outputs[plugin.name] = await plugin.run(contextInput);
      }
      return outputs as { [K in PluginSelector<TPlugins>]: RuntimePluginOutput<unknown> };
    })();
  }
}

export type PluginByName<T extends RuntimePlugin<string, unknown, unknown>, TName extends string> =
  T & { readonly name: TName };

export const registerPlugins = <TPlugins extends readonly RuntimePlugin<string, unknown, unknown>[]>(
  plugins: TPlugins,
): Registry<TPlugins> => new Registry<TPlugins>(plugins);

export const pluginByName = <
  TPlugins extends readonly RuntimePlugin<string, unknown, unknown>[],
  TName extends PluginSelector<TPlugins>,
>(
  registry: Registry<TPlugins>,
  name: NoInfer<TName>,
): PluginByName<TPlugins[number], TName> => {
  const plugin = registry.get(name);
  if (!plugin) {
    throw new Error(`missing plugin by name ${name}`);
  }
  return plugin as PluginByName<TPlugins[number], TName>;
};
