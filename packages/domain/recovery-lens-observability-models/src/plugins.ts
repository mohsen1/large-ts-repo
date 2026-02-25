import type { Prettify, Brand } from '@shared/type-level';
import type { LensRoute, PolicyContext, PolicyDescriptor } from './routes';
import type { ObserverNamespace, Severity } from './contracts';

export type LensPluginName = `lens-plugin:${string}`;
export type LensPluginId = Brand<string, 'LensPluginId'>;

export type PluginContext<TName extends LensPluginName = LensPluginName> = Prettify<{
  readonly namespace: ObserverNamespace;
  readonly route: LensRoute;
  readonly plugin: TName;
  readonly stage: string;
  readonly policy: PolicyDescriptor<string>;
}>;

export type PluginInput = Readonly<Record<string, unknown>>;
export type PluginOutput = Readonly<Record<string, unknown>>;

export type LensPlugin<TName extends LensPluginName = LensPluginName> = {
  readonly id: LensPluginId;
  readonly name: TName;
  readonly tags: readonly (`tag:${string}` | `scope:${string}`)[];
  readonly weight: number;
  readonly context: PolicyContext<TName extends `lens-plugin:${infer Tail}` ? Tail : string>;
  readonly dependencies: readonly LensPlugin<TName>[];
  readonly run: (input: PluginInput, context: PluginContext<TName>) => Promise<{
    readonly ok: true;
    readonly output: PluginOutput;
    readonly artifacts: readonly string[];
  }>;
};

export type PluginManifest<TEntries extends readonly LensPlugin[]> = {
  readonly registry: ReadonlyMap<TEntries[number]['name'], LensPlugin<TEntries[number]['name']>>;
  readonly tags: ReadonlyMap<string, readonly TEntries[number]['name'][]>;
};

export type PluginOutputByName<
  TEntries extends readonly LensPlugin[],
  TName extends TEntries[number]['name'],
> = TEntries[number] extends infer TPlugin
  ? TPlugin extends { name: TName; run: (...args: any[]) => Promise<infer TResult> }
    ? TResult extends { ok: true; output: infer TOutput }
      ? TOutput
      : never
    : never
  : never;

export const registerPlugins = <TEntries extends readonly LensPlugin[]>(
  plugins: TEntries,
): PluginManifest<TEntries> => {
  const registry = new Map<TEntries[number]['name'], LensPlugin<TEntries[number]['name']>>();
  const tags = new Map<string, TEntries[number]['name'][]>();

  for (const plugin of plugins) {
    registry.set(plugin.name, plugin as TEntries[number]);
    for (const tag of plugin.tags) {
      const bucket = [...(tags.get(tag) ?? [])];
      bucket.push(plugin.name);
      tags.set(tag, bucket);
    }
  }

  return {
    registry,
    tags: new Map<string, readonly TEntries[number]['name'][]>(
      Array.from(tags.entries()).map(([key, value]) => [key, [...value]] as const),
    ),
  } as PluginManifest<TEntries>;
};

export class PluginRunner<TPolicy extends readonly LensPlugin[]> {
  readonly #manifest: PluginManifest<TPolicy>;
  readonly #plugins: TPolicy;

  public constructor(plugins: TPolicy) {
    this.#plugins = plugins;
    this.#manifest = registerPlugins(this.#plugins);
  }

  public names(): readonly TPolicy[number]['name'][] {
    return [...this.#manifest.registry.keys()] as readonly TPolicy[number]['name'][];
  }

  public async runOne<TName extends TPolicy[number]['name']>(
    name: TName,
    input: PluginInput,
    context: Omit<PluginContext<TName>, 'plugin'> & { namespace: ObserverNamespace },
  ): Promise<PluginOutputByName<TPolicy, TName>> {
    const plugin = this.#manifest.registry.get(name);
    if (!plugin) {
      throw new Error(`plugin-missing:${String(name)}`);
    }
    const result = await plugin.run(input, { ...context, plugin: name } as PluginContext<TName>);
    if (!result.ok) {
      throw new Error(`plugin-failed:${String(name)}`);
    }
    return result.output as PluginOutputByName<TPolicy, TName>;
  }

  public async runAll(
    input: PluginInput,
    namespace: ObserverNamespace,
  ): Promise<readonly { readonly severity: Severity; readonly metric: `metric:${string}`; readonly payload: PluginOutput }[]> {
    const outputs: Array<{ readonly severity: Severity; readonly metric: `metric:${string}`; readonly payload: PluginOutput }> = [];
    for (const plugin of this.#plugins) {
      const result = await plugin.run(input, {
        namespace,
        route: `route:${plugin.name}`,
        plugin: plugin.name,
        stage: 'emit',
        policy: {
          name: String(plugin.name),
          enabled: true,
          retries: 0,
        },
      } as PluginContext);
      if (result.ok) {
        outputs.push({ severity: 'info', metric: `metric:${plugin.name}` as const, payload: result.output });
      }
    }

    return outputs;
  }

  public summary(): { readonly count: number; readonly tags: readonly string[]; readonly policies: readonly Severity[] } {
    return {
      count: this.#plugins.length,
      tags: [...new Set(this.#plugins.flatMap((entry) => entry.tags))],
      policies: ['info', 'warn', 'error', 'trace'],
    };
  }
}
