import {
  asBrand,
  createAsyncScope,
  type Awaitable,
  type Brand,
  type NoInfer,
  type PluginInput,
  type PluginOutput,
  type PluginRoute,
  type PluginSignal,
  type Result,
  fail,
  ok,
} from './types';
import { iteratorChain } from './iterator-utils';

export type WorkbenchPluginKind = 'ingest' | 'transform' | 'score' | 'publish' | 'validate' | 'notify';

export type WorkbenchPluginId = Brand<string, 'WorkbenchPluginId'>;
export type WorkbenchTenantId = Brand<string, 'WorkbenchTenantId'>;
export type WorkbenchWorkspaceId = Brand<string, 'WorkbenchWorkspaceId'>;

type DescriptorByName<
  TPlugins extends readonly WorkbenchAnyPlugin[],
  TName extends TPlugins[number]['pluginName'],
> = Extract<TPlugins[number], { pluginName: TName }>;

type DescriptorByRoute<
  TPlugins extends readonly WorkbenchAnyPlugin[],
  TRoute extends TPlugins[number]['route'],
> = Extract<TPlugins[number], { route: TRoute }>;

export interface WorkbenchPluginContext<TRoute extends string = string> {
  readonly tenantId: WorkbenchTenantId;
  readonly workspaceId: WorkbenchWorkspaceId;
  readonly route: TRoute;
  readonly requestId: string;
  readonly startedAt: number;
  readonly correlation?: {
    readonly runId: string;
    readonly operator: string;
  };
}

export interface WorkbenchPluginDescriptor<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TRoute extends PluginRoute = PluginRoute,
> {
  readonly pluginId: WorkbenchPluginId;
  readonly pluginName: TName;
  readonly route: TRoute;
  readonly kind: WorkbenchPluginKind;
  readonly dependencies: readonly WorkbenchPluginId[];
  canRun(context: WorkbenchPluginContext<TRoute>, signal: PluginSignal): boolean;
  readonly input: TInput;
  run(input: TInput, context: WorkbenchPluginContext<TRoute>): Awaitable<TOutput>;
}

export interface PluginRunEnvelope<TDescriptor extends WorkbenchAnyPlugin> {
  readonly pluginId: TDescriptor['pluginId'];
  readonly pluginName: TDescriptor['pluginName'];
  readonly route: TDescriptor['route'];
  readonly output: PluginOutput<TDescriptor>;
  readonly latencyMs: number;
}

export type ScopedRegistryStats = {
  readonly disposed: boolean;
  readonly pluginCount: number;
  readonly routeCount: number;
  readonly pluginNames: ReadonlySet<string>;
};

export interface PluginStatsByRoute {
  readonly route: PluginRoute;
  readonly count: number;
  readonly avgLatencyMs: number;
}

const makeScopeTag = (route: PluginRoute): string => `scope:${route}`;

export type WorkbenchAnyPlugin = WorkbenchPluginDescriptor<string, any, unknown, PluginRoute>;

export interface PluginRegistryStats {
  readonly statsByRoute: readonly PluginStatsByRoute[];
  readonly totals: ScopedRegistryStats;
}

const unique = (values: readonly string[]): ReadonlySet<string> => new Set(values);

export class WorkbenchPluginRegistry<TPlugins extends readonly WorkbenchAnyPlugin[] = readonly WorkbenchAnyPlugin[]> {
  readonly #plugins: ReadonlyArray<TPlugins[number]>;
  #disposed = false;

  constructor(plugins: NoInfer<TPlugins>) {
    this.#plugins = [...plugins];
  }

  [Symbol.iterator](): IterableIterator<TPlugins[number]> {
    return this.#plugins[Symbol.iterator]() as IterableIterator<TPlugins[number]>;
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  get stats(): ScopedRegistryStats {
    const routeSet = new Set<PluginRoute>(iteratorChain(this.#plugins).map((plugin) => plugin.route).toArray());
    return {
      disposed: this.#disposed,
      pluginCount: this.#plugins.length,
      routeCount: routeSet.size,
      pluginNames: unique(this.#plugins.map((plugin) => plugin.pluginName)),
    };
  }

  register<const TPlugin extends WorkbenchAnyPlugin>(plugin: TPlugin): WorkbenchPluginRegistry<[...TPlugins, TPlugin]> {
    const nextPlugins = [...this.#plugins, plugin] as [...TPlugins, TPlugin];
    return new WorkbenchPluginRegistry(nextPlugins);
  }

  getByName<TName extends TPlugins[number]['pluginName']>(
    name: NoInfer<TName>,
  ): WorkbenchPluginRegistry<[DescriptorByName<TPlugins, TName>]> | undefined {
    const plugin = this.#plugins.find((candidate): candidate is DescriptorByName<TPlugins, TName> =>
      candidate.pluginName === name,
    );
    if (!plugin) return undefined;
    return new WorkbenchPluginRegistry([plugin] as [DescriptorByName<TPlugins, TName>]);
  }

  getByRoute<TRoute extends TPlugins[number]['route']>(
    route: NoInfer<TRoute>,
  ): WorkbenchPluginRegistry<readonly DescriptorByRoute<TPlugins, TRoute>[]> {
    const selected = iteratorChain(this.#plugins)
      .filter((plugin): plugin is DescriptorByRoute<TPlugins, TRoute> => plugin.route === route)
      .toArray();
    return new WorkbenchPluginRegistry(selected as readonly DescriptorByRoute<TPlugins, TRoute>[]);
  }

  routeKinds(): readonly PluginRoute[] {
    return iteratorChain(this.#plugins).map((plugin) => plugin.route).toArray();
  }

  pluginIds(): readonly WorkbenchPluginId[] {
    return iteratorChain(this.#plugins).map((plugin) => plugin.pluginId).toArray();
  }

  async run<TName extends TPlugins[number]['pluginName'], TDescriptor extends DescriptorByName<TPlugins, TName>>(
    name: TName,
    input: PluginInput<TDescriptor>,
    context: WorkbenchPluginContext<TDescriptor['route']>,
  ): Promise<Result<PluginRunEnvelope<TDescriptor>, Error>> {
    if (this.#disposed) return fail(new Error('plugin registry disposed'));

    const candidate = this.#plugins.find((plugin): plugin is TDescriptor => plugin.pluginName === name);
    if (!candidate) {
      return fail(new Error(`plugin ${String(name)} not found`));
    }

    const stack = createAsyncScope();
    using _stack = stack;
    stack.adopt(candidate.pluginId, () => {});
    const signal = this.synthesizeSignal(context.route, context);

    if (!this.canRun(candidate, context, signal)) {
      return fail(new Error(`plugin ${candidate.pluginName} rejected by guard`));
    }

    const start = performance.now();
    try {
      const output = (await Promise.resolve(candidate.run(input, context))) as PluginOutput<TDescriptor>;
      return ok({
        pluginId: candidate.pluginId,
        pluginName: candidate.pluginName,
        route: candidate.route,
        output,
        latencyMs: Math.max(0, performance.now() - start),
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('plugin run failed'));
    }
  }

  async runRoute<TRoute extends TPlugins[number]['route']>(
    route: NoInfer<TRoute>,
    input: PluginInput<DescriptorByRoute<TPlugins, TRoute>>,
    context: WorkbenchPluginContext<TRoute>,
  ): Promise<readonly PluginRunEnvelope<DescriptorByRoute<TPlugins, TRoute>>[]> {
    const routeSignal = this.synthesizeSignal(route, context);
    const candidates = iteratorChain(this.#plugins)
      .filter((plugin): plugin is DescriptorByRoute<TPlugins, TRoute> => plugin.route === route)
      .filter((plugin) => this.canRun(plugin, context, routeSignal))
      .toArray();

    const stack = createAsyncScope();
    using _stack = stack;
    stack.adopt(makeScopeTag(route), () => {});

    const outputs: PluginRunEnvelope<DescriptorByRoute<TPlugins, TRoute>>[] = [];
    for (const plugin of candidates) {
      const startedAt = performance.now();
      const output = (await Promise.resolve(
        plugin.run(input as PluginInput<DescriptorByRoute<TPlugins, TRoute>>, context),
      )) as PluginOutput<DescriptorByRoute<TPlugins, TRoute>>;
      outputs.push({
        pluginId: plugin.pluginId,
        pluginName: plugin.pluginName,
        route: plugin.route as DescriptorByRoute<TPlugins, TRoute>['route'],
        output,
        latencyMs: Math.max(0, performance.now() - startedAt),
      });
    }

    return outputs;
  }

  statsByRoute(): readonly PluginStatsByRoute[] {
    return iteratorChain(this.routeKinds())
      .map((route) => {
        const metrics = iteratorChain(this.#plugins).filter((plugin) => plugin.route === route).toArray();
        return {
          route,
          count: metrics.length,
          avgLatencyMs: 0,
        };
      })
      .toArray();
  }

  private canRun(
    plugin: WorkbenchAnyPlugin,
    context: WorkbenchPluginContext<PluginRoute>,
    signal: PluginSignal,
  ): boolean {
    return plugin.canRun(context, signal) && plugin.dependencies.every((dependency) => this.pluginIds().includes(dependency));
  }

  private synthesizeSignal(route: PluginRoute, context: WorkbenchPluginContext<PluginRoute>): PluginSignal {
    return {
      type: route,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      requestId: context.requestId,
      stage: route,
      confidence: 1,
    };
  }
}

export const makePluginId = (namespace: string, plugin: string): WorkbenchPluginId => asBrand(`${namespace}/${plugin}`);
