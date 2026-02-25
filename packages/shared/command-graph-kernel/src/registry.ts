import type { PluginMap, PluginDefinition, PluginResult, PluginOutput, PluginInput } from './plugin';

export interface RegistryLookupError {
  readonly code: 'not-found' | 'failed-dependency' | 'invalid-output';
  readonly detail: string;
}

export class PluginRegistry<TPlugins extends PluginMap> {
  #entries = new Map<string, PluginDefinition<any, any, any, any, any>>();
  public constructor(private readonly plugins: TPlugins) {
    Object.entries(plugins).forEach(([name, plugin]) => {
      this.#entries.set(name, plugin as PluginDefinition<any, any, any, any, any>);
    });
  }

  has(name: keyof TPlugins & string): boolean {
    return this.#entries.has(name as string);
  }

  keys(): readonly (keyof TPlugins & string)[] {
    return [...this.#entries.keys()] as Array<keyof TPlugins & string>;
  }

  get<TName extends keyof TPlugins & string>(name: TName): TPlugins[TName] | undefined {
    return this.#entries.get(name as string) as TPlugins[TName] | undefined;
  }

  register<TName extends string>(name: TName, plugin: TPlugins[keyof TPlugins]): void {
    this.#entries.set(name, plugin as PluginDefinition<any, any, any, any, any>);
  }

  async run<TName extends keyof TPlugins & string>(
    name: TName,
    context: Parameters<TPlugins[TName]['run']>[0],
    input: PluginInput<TPlugins[TName]>,
  ): Promise<PluginResult<any>> {
    const plugin = this.get(name) as PluginDefinition<PluginInput<TPlugins[TName]>, PluginOutput<TPlugins[TName]>, any, any, any> | undefined;
    if (!plugin) {
      return { ok: false, error: `missing-plugin:${String(name)}`, generatedAt: new Date().toISOString() };
    }

    if (!plugin.inputSchema(input)) {
      return { ok: false, error: `invalid-input:${String(name)}`, generatedAt: new Date().toISOString() };
    }

    const result = await plugin.run(context, input);
    if (!result.ok) {
      return result;
    }

    if (!plugin.outputSchema(result.value)) {
      return { ok: false, error: `invalid-output:${String(name)}`, generatedAt: new Date().toISOString() };
    }

    return result as PluginResult<any>;
  }

  dependsOn(name: keyof TPlugins & string): readonly string[] {
    return this.#entries.get(name)?.dependencies ?? [];
  }

  snapshot(): readonly { key: keyof TPlugins & string; namespace: string }[] {
    return [...this.#entries.entries()].map(([key, plugin]) => ({
      key,
      namespace: plugin.namespace,
    }));
  }
}
