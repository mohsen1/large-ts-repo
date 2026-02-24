import type { NoInfer } from './tuple-utils';
import type { Brand } from './brands';

export type PluginNamespace = `namespace:${string}`;
export type PluginName = `plugin:${string}`;
export type PluginTag<TTag extends string = string> = `tag:${TTag}`;
export type PluginDependency<TAllPlugins extends PluginName = PluginName> = TAllPlugins | PluginName;

export type StageEventId = Brand<string, 'StageEventId'>;

export type PluginLifecycle<TInput = unknown, TOutput = unknown> = (
  input: NoInfer<TInput>,
  context: PluginExecutionContext<TInput>,
) => Promise<PluginResult<TOutput>>;

export interface PluginExecutionContext<TInput> {
  readonly id: StageEventId;
  readonly namespace: PluginNamespace;
  readonly startedAt: string;
  readonly input: NoInfer<TInput>;
  readonly correlation: {
    readonly runId: Brand<string, 'RunId'>;
    readonly tenant: Brand<string, 'TenantId'>;
  };
}

export type PluginStatus = 'running' | 'success' | 'skipped' | 'error' | 'cancelled';

export interface PluginResultBase<TOutput> {
  readonly status: PluginStatus;
  readonly message: string;
  readonly output: TOutput | null;
  readonly elapsedMs: number;
  readonly artifacts: readonly string[];
}

export interface PluginSuccess<TOutput> extends PluginResultBase<TOutput> {
  readonly status: 'success';
  readonly skipped: false;
}

export interface PluginSkip {
  readonly status: 'skipped' | 'cancelled';
  readonly skipped: true;
  readonly output: null;
  readonly artifacts: readonly string[];
  readonly elapsedMs: 0;
  readonly message: string;
}

export interface PluginFailure {
  readonly status: 'error';
  readonly skipped: false;
  readonly output: null;
  readonly artifacts: readonly string[];
  readonly elapsedMs: number;
  readonly message: string;
  readonly reason: {
    readonly code: string & Brand<string, 'ErrorCode'>;
    readonly details: readonly string[];
  };
}

export type PluginResult<TOutput> = PluginSuccess<TOutput> | PluginSkip | PluginFailure;

export interface PluginDefinition<
  TInput,
  TOutput,
  TAll extends PluginName = PluginName,
> {
  readonly name: TAll;
  readonly namespace: PluginNamespace;
  readonly version: `v${number}.${number}`;
  readonly dependsOn: readonly PluginDependency<TAll>[];
  readonly description: string;
  readonly tags: readonly PluginTag<string>[];
  readonly run: PluginLifecycle<TInput, TOutput>;
}

export type RegisteredNames<TPlugins extends readonly PluginDefinition<unknown, unknown, PluginName>[]> = TPlugins[number]['name'];

export type PluginByName<
  TPlugins extends readonly PluginDefinition<unknown, unknown, PluginName>[],
  TTarget extends RegisteredNames<TPlugins>,
> = Extract<TPlugins[number], { name: TTarget }>;

export type LifecycleSummary<TPlugins extends readonly PluginDefinition<unknown, unknown, PluginName>[]> = {
  [K in RegisteredNames<TPlugins> as `summary:${K}`]: PluginByName<TPlugins, K>;
};

export class PluginRegistry<
  TPlugins extends readonly PluginDefinition<unknown, unknown, PluginName>[] = readonly PluginDefinition<
    unknown,
    unknown,
    PluginName
  >[],
> {
  #definitions = new Map<PluginName, PluginDefinition<unknown, unknown, PluginName>>();
  #order: RegisteredNames<TPlugins>[] = [];

  public constructor(private readonly plugins: TPlugins) {
    for (const plugin of plugins) {
      this.#definitions.set(plugin.name, plugin);
      this.#order.push(plugin.name as RegisteredNames<TPlugins>);
    }
  }

  public names(): readonly RegisteredNames<TPlugins>[] {
    return this.#order;
  }

  public all(): readonly TPlugins[number][] {
    return this.plugins as readonly TPlugins[number][];
  }

  public has(name: RegisteredNames<TPlugins>): boolean {
    return this.#definitions.has(name);
  }

  public get<TName extends RegisteredNames<TPlugins>>(name: TName): PluginByName<TPlugins, TName> | undefined {
    return this.#definitions.get(name) as PluginByName<TPlugins, TName> | undefined;
  }

  public dependenciesFor<TName extends RegisteredNames<TPlugins>>(name: TName): readonly PluginName[] {
    return this.get(name)?.dependsOn ?? [];
  }

  public async run<TName extends RegisteredNames<TPlugins>, TInput>(
    name: TName,
    input: NoInfer<TInput>,
    context: Omit<PluginExecutionContext<TInput>, 'input'>,
  ): Promise<unknown> {
    const entry = this.get(name);
    if (!entry) {
      throw new Error(`Missing plugin ${name}`);
    }

    const result = await entry.run(input, {
      ...context,
      input,
      id: context.id as StageEventId,
      namespace: entry.namespace,
      startedAt: new Date().toISOString(),
    });

    if (result.status !== 'success') {
      throw new Error(result.message);
    }

    return result.output;
  }
}

export const resolveExecutionOrder = <TPlugins extends readonly PluginDefinition<unknown, unknown, PluginName>[]>(
  registry: PluginRegistry<TPlugins>,
): readonly RegisteredNames<TPlugins>[] => {
  const byName = new Map<PluginName, PluginDefinition<unknown, unknown, PluginName>>();
  for (const plugin of registry.all()) {
    byName.set(plugin.name, plugin);
  }

  const order: PluginName[] = [];
  const visited = new Set<PluginName>();
  const resolving = new Set<PluginName>();

  const visit = (name: PluginName): void => {
    if (visited.has(name)) {
      return;
    }
    if (resolving.has(name)) {
      throw new Error(`Cyclic plugin dependency: ${name}`);
    }

    const plugin = byName.get(name);
    if (!plugin) {
      return;
    }

    resolving.add(name);
    for (const dep of plugin.dependsOn) {
      visit(dep as PluginName);
    }
    resolving.delete(name);
    visited.add(name);
    order.push(name);
  };

  for (const name of byName.keys()) {
    visit(name);
  }

  return order as readonly RegisteredNames<TPlugins>[];
};
