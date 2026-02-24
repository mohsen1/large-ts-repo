import type {
  Brand,
  IncidentSeverity,
  PluginRunId,
  RecoverySignal,
  RunPlanId,
  TenantId,
} from './type-system';
import { LabScope, withAsyncDisposableScope } from './disposables';

export type PluginNamespace = `namespace:${string}`;
export type PluginName = `plugin:${string}`;
export type PluginTag<TTag extends string> = `tag:${TTag}`;
export type PluginStatus = 'idle' | 'running' | 'success' | 'skip' | 'error' | 'degraded';
export type PluginFingerprint = Brand<string, 'PluginFingerprint'>;
export type PluginDependencyGraph = Map<PluginName, readonly PluginName[]>;

export type PluginResultStatus = Extract<PluginStatus, 'success' | 'skip' | 'error'>;

export interface PluginTelemetry {
  readonly scope: `scope:${string}`;
  readonly durationMs: number;
  readonly signalCount: number;
  readonly metric: Brand<number, 'ReliabilityMetric'>;
}

export interface PluginLifecycleContext {
  readonly tenant: TenantId;
  readonly runId: RunPlanId;
  readonly commandId: PluginRunId;
  readonly correlationId: Brand<string, 'CommandCorrelationId'>;
  readonly startedAt: string;
}

export interface PluginResult<TOutput> {
  readonly status: PluginResultStatus;
  readonly output?: TOutput;
  readonly reason?: string;
  readonly telemetry: PluginTelemetry;
  readonly message: string;
}

export interface PluginDefinition<
  TName extends PluginName = PluginName,
  TInput = unknown,
  TOutput = unknown,
  TNamespace extends PluginNamespace = PluginNamespace,
> {
  readonly name: TName;
  readonly namespace: TNamespace;
  readonly version: `v${number}.${number}`;
  readonly dependsOn: readonly PluginName[];
  readonly tags: readonly PluginTag<string>[];
  readonly description: string;
  readonly run: (
    input: TInput,
    context: PluginLifecycleContext,
    runtime: readonly RuntimeSignal[],
  ) => Promise<PluginResult<TOutput>> | PluginResult<TOutput>;
}

export interface RuntimeSignal {
  readonly category: `signal:${string}`;
  readonly severity: `severity:${IncidentSeverity}`;
  readonly fingerprint: Brand<string, 'SignalHash'>;
}

export interface PluginExecutionEnvelope<TOutput> {
  readonly runId: RunPlanId;
  readonly plugin: PluginName;
  readonly output: TOutput;
  readonly telemetry: PluginTelemetry;
}

export type RegisteredPluginNames<TCatalog extends readonly PluginDefinition[]> = TCatalog[number]['name'];

export type RegisteredPluginInput<
  TCatalog extends readonly PluginDefinition[],
  TName extends RegisteredPluginNames<TCatalog>,
> = Extract<TCatalog[number], { readonly name: TName }> extends { readonly run: (input: infer TInput, ..._rest: unknown[]) => unknown }
  ? TInput
  : never;

export type RegisteredPluginOutput<
  TCatalog extends readonly PluginDefinition[],
  TName extends RegisteredPluginNames<TCatalog>,
> = Extract<TCatalog[number], { readonly name: TName }> extends {
  readonly run: (input: unknown, context: PluginLifecycleContext, runtime: readonly RuntimeSignal[]) => Promise<{
    readonly output?: infer TOutput;
  }>;
}
  ? TOutput
  : never;

type TopoState = 'new' | 'visiting' | 'done';

export class PluginRegistry<TPlugins extends readonly PluginDefinition[]> {
  readonly #plugins = new Map<PluginName, TPlugins[number]>();
  readonly #order: RegisteredPluginNames<TPlugins>[] = [];

  public constructor(private readonly plugins: TPlugins) {
    for (const plugin of plugins) {
      if (this.#plugins.has(plugin.name)) {
        throw new Error(`Duplicate plugin name ${plugin.name}`);
      }
      this.#plugins.set(plugin.name, plugin);
      this.#order.push(plugin.name as RegisteredPluginNames<TPlugins>);
    }
    this.validate();
  }

  public get<TName extends RegisteredPluginNames<TPlugins>>(name: TName): TPlugins[number] & { readonly name: TName } {
    const plugin = this.#plugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown plugin: ${name}`);
    }
    return plugin as TPlugins[number] & { readonly name: TName };
  }

  public names(): readonly RegisteredPluginNames<TPlugins>[] {
    return this.#order;
  }

  public values(): ReadonlyArray<TPlugins[number]> {
    return [...this.plugins];
  }

  public dependencyGraph(): PluginDependencyGraph {
    const graph = new Map<PluginName, readonly PluginName[]>();
    for (const plugin of this.plugins) {
      graph.set(plugin.name, plugin.dependsOn);
    }
    return graph;
  }

  public executionOrder(): readonly RegisteredPluginNames<TPlugins>[] {
    const ordered = new Array<RegisteredPluginNames<TPlugins>>();
    const state = new Map<string, TopoState>();

    const walk = (name: RegisteredPluginNames<TPlugins>): void => {
      if (state.get(name) === 'done') {
        return;
      }
      if (state.get(name) === 'visiting') {
        throw new Error(`Cyclic dependency detected for plugin ${name}`);
      }
      state.set(name, 'visiting');
      const plugin = this.get(name);
      for (const dependency of plugin.dependsOn) {
        walk(dependency as RegisteredPluginNames<TPlugins>);
      }
      state.set(name, 'done');
      ordered.push(name);
    };

    for (const name of this.#order) {
      walk(name);
    }
    return ordered;
  }

  public async execute<
    TName extends RegisteredPluginNames<TPlugins>,
    TInput extends RegisteredPluginInput<TPlugins, TName>,
  >(
    name: TName,
    input: TInput,
    context: PluginLifecycleContext,
    runtime: readonly RuntimeSignal[],
  ): Promise<PluginExecutionEnvelope<RegisteredPluginOutput<TPlugins, TName>>> {
    const plugin = this.get(name);
    const started = Date.now();

    return withAsyncDisposableScope(async () => {
      using _scope = new LabScope(`plugin:${plugin.name}`);
      const result = await plugin.run(input, context, runtime);
      const telemetry = {
        ...result.telemetry,
        durationMs: Date.now() - started,
      };

      if (result.output === undefined) {
        throw new Error(`${plugin.name} returned no output`);
      }

      return {
        runId: context.runId,
        plugin: plugin.name,
        output: result.output as RegisteredPluginOutput<TPlugins, TName>,
        telemetry,
      };
    });
  }

  private validate(): void {
    const graph = this.dependencyGraph();
    for (const [pluginName, dependencies] of graph) {
      for (const dependency of dependencies) {
        if (!graph.has(dependency)) {
          throw new Error(`Missing dependency ${dependency} for plugin ${pluginName}`);
        }
      }
    }
  }
}

export const buildPluginGraph = <TPlugins extends readonly PluginDefinition[]>(
  registry: PluginRegistry<TPlugins>,
): Record<RegisteredPluginNames<TPlugins>, readonly PluginName[]> => {
  const graph = registry.dependencyGraph();
  const entries = [...graph.entries()] as readonly [RegisteredPluginNames<TPlugins>, readonly PluginName[]][];
  return Object.fromEntries(entries) as Record<RegisteredPluginNames<TPlugins>, readonly PluginName[]>;
};
