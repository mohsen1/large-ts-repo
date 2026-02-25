import { type NoInfer, type PluginDependency, type PluginLifecycle, type PluginName, type PluginResult } from '@shared/typed-orchestration-core';
import type { JsonValue } from '@shared/type-level';
import type { NamespaceTag, PluginId, RunId, TenantId } from './identifiers';

export type EcosystemPluginName = PluginName;

export type PluginInput<TInput extends JsonValue = JsonValue> = {
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly trace: readonly string[];
  readonly input: TInput;
};

export type PluginOutput<TOutput extends JsonValue = JsonValue> = {
  readonly output: TOutput;
  readonly summary: string;
  readonly consumed: number;
  readonly produced: number;
  readonly artifacts: readonly string[];
};

export type PluginLifecycleResult<TOutput extends JsonValue = JsonValue> = PluginResult<PluginOutput<TOutput>>;

export interface EcosystemPlugin<TInput extends JsonValue = JsonValue, TOutput extends JsonValue = JsonValue> {
  readonly name: EcosystemPluginName;
  readonly namespace: NamespaceTag;
  readonly version: `v${number}.${number}`;
  readonly dependsOn: readonly PluginDependency[];
  readonly description: string;
  readonly tags: readonly `tag:${string}`[];
  readonly run: PluginLifecycle<PluginInput<TInput>, PluginLifecycleResult<TOutput>>;
  readonly pluginFor: PluginFor<TInput, TOutput>;
}

export type PluginFor<TInput extends JsonValue = JsonValue, TOutput extends JsonValue = JsonValue> = EcosystemPlugin<TInput, TOutput>['run'];

export type RegisteredNames<TPlugins extends readonly EcosystemPlugin[]> = TPlugins[number]['name'];
export type PluginByName<
  TPlugins extends readonly EcosystemPlugin[],
  TName extends RegisteredNames<TPlugins>,
> = Extract<TPlugins[number], { readonly name: TName }>;

export type PluginInputByName<TPlugins extends readonly EcosystemPlugin[], TName extends RegisteredNames<TPlugins>> =
  Parameters<PluginByName<TPlugins, TName>['run']>[0];

export type PluginOutputByName<TPlugins extends readonly EcosystemPlugin[], TName extends RegisteredNames<TPlugins>> =
  Awaited<ReturnType<PluginByName<TPlugins, TName>['run']>> extends {
    readonly status: 'success';
    readonly output: infer TValue;
  }
    ? TValue
    : never;

export type PluginInputMap<TPlugins extends readonly EcosystemPlugin[]> = {
  [P in RegisteredNames<TPlugins>]: PluginInputByName<TPlugins, P>;
};

export type PluginOutputMap<TPlugins extends readonly EcosystemPlugin[]> = {
  [P in RegisteredNames<TPlugins>]: PluginOutputByName<TPlugins, P>;
};

export interface PluginContext<TInput extends JsonValue> {
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly step: string;
  readonly correlation: {
    readonly runId: RunId;
    readonly tenant: TenantId;
  };
  readonly input: NoInfer<TInput>;
}

export interface PluginExecution<TPlugins extends readonly EcosystemPlugin[]> {
  readonly input: PluginInputMap<TPlugins>;
  readonly plugins: TPlugins;
}

const resolveExecutionOrder = <TPlugins extends readonly EcosystemPlugin[]>(plugins: TPlugins): readonly RegisteredNames<TPlugins>[] => {
  const byName = new Map<RegisteredNames<TPlugins>, TPlugins[number]>();
  for (const plugin of plugins) {
    byName.set(plugin.name as RegisteredNames<TPlugins>, plugin);
  }

  const visited = new Set<RegisteredNames<TPlugins>>();
  const resolving = new Set<RegisteredNames<TPlugins>>();
  const order: RegisteredNames<TPlugins>[] = [];

  const walk = (name: RegisteredNames<TPlugins>): void => {
    if (visited.has(name)) {
      return;
    }
    if (resolving.has(name)) {
      throw new Error(`plugin-cycle:${String(name)}`);
    }
    resolving.add(name);
    const plugin = byName.get(name);
    for (const dependency of plugin?.dependsOn ?? []) {
      const next = byName.get(dependency as RegisteredNames<TPlugins>);
      if (next) {
        walk(dependency as RegisteredNames<TPlugins>);
      }
    }
    resolving.delete(name);
    visited.add(name);
    order.push(name);
  };

  for (const name of byName.keys()) {
    walk(name);
  }
  return order;
};

export class EcosystemPluginRegistry<TPlugins extends readonly EcosystemPlugin[]> {
  readonly #plugins: Map<RegisteredNames<TPlugins>, TPlugins[number]>;
  readonly #order: readonly RegisteredNames<TPlugins>[];

  public constructor(private readonly plugins: TPlugins) {
    this.#plugins = new Map(
      this.plugins.map((plugin) => [plugin.name as RegisteredNames<TPlugins>, plugin] as const),
    );
    this.#order = resolveExecutionOrder(this.plugins);
  }

  public names(): readonly RegisteredNames<TPlugins>[] {
    return this.#order;
  }

  public resolveOrder(): readonly RegisteredNames<TPlugins>[] {
    return this.#order;
  }

  public has<TName extends RegisteredNames<TPlugins>>(name: TName): boolean {
    return this.#plugins.has(name);
  }

  public dependencies<TName extends RegisteredNames<TPlugins>>(name: TName): readonly PluginDependency[] {
    return (this.#plugins.get(name)?.dependsOn ?? []) as readonly PluginDependency[];
  }

  public pluginIds(): readonly PluginId[] {
    return this.plugins.map((plugin) => plugin.name as PluginId);
  }

  public async run<TName extends RegisteredNames<TPlugins>, TInput extends JsonValue>(
    name: TName,
    input: NoInfer<PluginInputByName<TPlugins, TName>>,
    context: Omit<PluginContext<TInput>, 'input'>,
  ): Promise<NoInfer<PluginOutputByName<TPlugins, TName>>> {
    const plugin = this.#plugins.get(name);
    if (!plugin) {
      throw new Error(`plugin-missing:${name}`);
    }

    const output = await plugin.run(input, {
      ...context,
      id: `event:${String(context.runId)}`,
      namespace: plugin.namespace as string,
      startedAt: new Date().toISOString(),
      input,
    } as never);

    if (output.status !== 'success') {
      throw new Error(output.message);
    }
    return output.output as NoInfer<PluginOutputByName<TPlugins, TName>>;
  }
}

export const asDependencies = <TPlugins extends readonly EcosystemPlugin[]>() => <TName extends RegisteredNames<TPlugins>>(
  registry: EcosystemPluginRegistry<TPlugins>,
  name: TName,
): readonly PluginDependency[] => registry.dependencies(name);
