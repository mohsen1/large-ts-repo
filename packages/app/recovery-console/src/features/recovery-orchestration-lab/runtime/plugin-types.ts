import type {
  RecoveryMetrics,
  RunPlanId,
  TenantId,
  OrchestrationPlanInput,
  OrchestrationPlanOutput,
} from '../domain/models';
import { Brand, type PrefixTupleValues, type NoInfer } from '../domain/type-utilities';

export type PluginNamespace = `namespace:${string}`;
export type PluginName = `plugin:${string}`;
export type PluginTag<TTag extends string> = `tag:${TTag}`;
export type PluginStatus = 'queued' | 'running' | 'success' | 'skip' | 'error' | 'skipped';

export interface PluginLifecycleContext {
  readonly tenant: TenantId;
  readonly runId: RunPlanId;
  readonly commandId: string & Brand<string, 'PluginRunId'>;
  readonly timestamp: string;
}

export interface PluginTelemetry {
  readonly scope: PluginNamespace;
  readonly latencyMs: number;
  readonly signalCount: number;
  readonly metrics: RecoveryMetrics;
}

export interface PluginSuccess<TOutput> {
  readonly status: 'success';
  readonly output: TOutput;
  readonly message: string;
  readonly telemetry: PluginTelemetry;
}

export interface PluginSkip {
  readonly status: 'skip';
  readonly reason: 'cache-hit' | 'dependency-failed' | 'disabled';
  readonly message: string;
  readonly telemetry: PluginTelemetry;
}

export interface PluginError {
  readonly status: 'error';
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly string[];
  };
  readonly telemetry: PluginTelemetry;
}

export type PluginResult<TOutput> = PluginSuccess<TOutput> | PluginSkip | PluginError;

export type RuntimeSignalMetadata = {
  readonly category: `signal:${string}`;
  readonly severity: `severity:${'critical' | 'high' | 'moderate' | 'low'}`;
  readonly fingerprint: Brand<string, 'SignalHash'>;
};

export type PluginDefinition<
  TName extends PluginName = PluginName,
  TInput = OrchestrationPlanInput,
  TOutput = OrchestrationPlanOutput,
  TNamespace extends PluginNamespace = PluginNamespace,
> = {
  readonly name: TName;
  readonly namespace: TNamespace;
  readonly version: `v${number}.${number}`;
  readonly dependsOn: readonly PluginName[];
  readonly tags: readonly PluginTag<string>[];
  readonly description: string;
  readonly run: (
    input: NoInfer<TInput>,
    context: PluginLifecycleContext,
    runtime: readonly RuntimeSignalMetadata[],
  ) => Promise<PluginResult<TOutput>>;
};

export type StagePaths = PrefixTupleValues<'stage', readonly ['parse', 'normalize', 'execute', 'report']>;
export type RegisteredNames<TPlugins extends readonly PluginDefinition<any, any, any, any>[]> = TPlugins[number]['name'];

export class PluginRegistry<
  TPlugins extends readonly PluginDefinition<any, any, any, any>[] = readonly PluginDefinition<any, any, any, any>[],
> {
  #plugins = new Map<PluginName, PluginDefinition>();
  #order: RegisteredNames<TPlugins>[] = [];

  public constructor(private readonly plugins: TPlugins) {
    for (const plugin of plugins) {
      this.#plugins.set(plugin.name, plugin);
      this.#order.push(plugin.name as RegisteredNames<TPlugins>);
    }
  }

  public values(): ReadonlyArray<TPlugins[number]> {
    return [...this.plugins] as unknown as TPlugins;
  }

  public get<TName extends RegisteredNames<TPlugins>>(name: TName): TPlugins[number] & { name: TName } {
    return this.#plugins.get(name) as TPlugins[number] & { name: TName };
  }

  public names(): readonly RegisteredNames<TPlugins>[] {
    return this.#order;
  }

  public async run<TName extends RegisteredNames<TPlugins>>(
    name: TName,
    input: unknown,
    context: PluginLifecycleContext,
    runtime: readonly RuntimeSignalMetadata[],
  ): Promise<OrchestrationPlanOutput> {
    const plugin = this.get(name);
    const outcome = await plugin.run(input as never, context, runtime);

    if (outcome.status === 'skip') {
      return input as OrchestrationPlanOutput;
    }
    if (outcome.status === 'error') {
      throw new Error(`Plugin ${name} failed: ${outcome.error.code}`);
    }
    return outcome.output as OrchestrationPlanOutput;
  }
}

export const inferExecutionOrder = <TPlugins extends readonly PluginDefinition<any, any, any, any>[]>(
  registry: PluginRegistry<TPlugins>,
): readonly RegisteredNames<TPlugins>[] => {
  const byName = new Map<PluginName, PluginDefinition>();
  for (const plugin of registry.values()) {
    byName.set(plugin.name, plugin);
  }

  const visited = new Set<PluginName>();
  const order: PluginName[] = [];

  const resolve = (name: PluginName): void => {
    if (visited.has(name)) {
      return;
    }
    const plugin = byName.get(name);
    if (!plugin) {
      return;
    }
    for (const dependency of plugin.dependsOn) {
      resolve(dependency);
    }
    visited.add(name);
    order.push(name);
  };

  for (const plugin of registry.values()) {
    resolve(plugin.name);
  }

  return order as readonly RegisteredNames<TPlugins>[];
};
