import { createAsyncScope, iteratorChain, type Result, fail, ok } from '@shared/recovery-workbench-runtime';
import type { Brand } from '@shared/type-level';
import {
  makeIntentTenant,
  makeIntentWorkspace,
  isRouteMatch,
  NoInfer,
  type IntentInput,
  type IntentOutput,
  type IntentPluginContext,
  type IntentSignal,
  type PluginDescriptor,
  type PluginByRoute,
  type PluginByName,
  type RouteOutput,
} from './intent-types';
import { projectSignals, scoreGraph, type IntentGraphSnapshot } from './intent-graph';

export type IntentRegistryPlugin<
  TName extends string = string,
  TInput extends IntentInput = IntentInput,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
  TRoute extends string = string,
> = PluginDescriptor<TName, TInput, TOutput, TRoute, string>;

type PluginRunOutput<TDescriptor extends IntentRegistryPlugin> = Awaited<ReturnType<TDescriptor['run']>>;

export type RegistryEnvelope<TDescriptor extends IntentRegistryPlugin> = {
  readonly pluginId: TDescriptor['pluginId'];
  readonly pluginName: TDescriptor['pluginName'];
  readonly route: TDescriptor['route'];
  readonly output: PluginRunOutput<TDescriptor>;
  readonly metrics: {
    readonly latencyMs: number;
    readonly routeMatch: boolean;
  };
};

export type RegistryStats = {
  readonly routeCount: number;
  readonly pluginCount: number;
  readonly disposed: boolean;
};

export type RegistryRouteMap<TPlugins extends readonly IntentRegistryPlugin[]> = {
  [Route in TPlugins[number]['route'] & string]: PluginByRoute<TPlugins, Route>[];
};

const toScopeLabel = <TRoute extends string>(route: TRoute): `scope:${TRoute}` => `scope:${route}`;

export class IntentPluginRegistry<
  TPlugins extends readonly IntentRegistryPlugin[] = readonly IntentRegistryPlugin[],
> {
  readonly #plugins: readonly TPlugins[number][];
  #disposed = false;

  constructor(plugins: NoInfer<TPlugins>) {
    this.#plugins = [...plugins] as readonly TPlugins[number][];
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

  get stats(): RegistryStats {
    const routeCount = new Set(this.#plugins.map((plugin) => plugin.route)).size;
    return {
      routeCount,
      pluginCount: this.#plugins.length,
      disposed: this.#disposed,
    };
  }

  withPlugins<TPlugin extends TPlugins[number]>(
    plugin: NoInfer<TPlugin>,
  ): IntentPluginRegistry<readonly [...TPlugins, TPlugin]> {
    const next = [...this.#plugins, plugin] as unknown as readonly [...TPlugins, TPlugin];
    return new IntentPluginRegistry(next);
  }

  byRoute<TRoute extends TPlugins[number]['route']>(
    route: NoInfer<TRoute>,
  ): IntentPluginRegistry<PluginByRoute<TPlugins, TRoute>[]> {
    const selected = iteratorChain(this.#plugins)
      .filter((plugin): plugin is PluginByRoute<TPlugins, TRoute> => plugin.route === route)
      .toArray();
    return new IntentPluginRegistry(selected as unknown as PluginByRoute<TPlugins, TRoute>[]);
  }

  hasRoute<TRoute extends TPlugins[number]['route']>(route: NoInfer<TRoute>): route is TRoute {
    return this.#plugins.some((plugin) => plugin.route === route);
  }

  routeCatalog(): RegistryRouteMap<TPlugins> {
    const grouped: Record<string, IntentRegistryPlugin[]> = {};
    for (const plugin of this.#plugins) {
      const key = plugin.route as string;
      grouped[key] = [...(grouped[key] ?? []), plugin];
    }
    return grouped as RegistryRouteMap<TPlugins>;
  }

  async runRoute<TRoute extends TPlugins[number]['route']>(
    route: NoInfer<TRoute>,
    input: PluginByRoute<TPlugins, TRoute>['input'],
    context: IntentPluginContext<TRoute>,
  ): Promise<readonly RegistryEnvelope<PluginByRoute<TPlugins, TRoute>>[]> {
    if (this.#disposed) {
      return [];
    }

    const candidates = iteratorChain(this.#plugins)
      .filter((plugin): plugin is PluginByRoute<TPlugins, TRoute> => plugin.route === route)
      .filter((plugin) => plugin.canRun(context))
      .toArray();

    if (candidates.length === 0) {
      return [];
    }

    const scope = createAsyncScope();
    using _scope = scope;
    scope.adopt({ route, count: candidates.length }, () => {});

    return Promise.all(
      candidates.map(async (plugin): Promise<RegistryEnvelope<PluginByRoute<TPlugins, TRoute>>> => {
        const startedAt = performance.now();
        const output = (await Promise.resolve(plugin.run(input as never, context))) as RegistryEnvelope<
          PluginByRoute<TPlugins, TRoute>
        >['output'];
        return {
          pluginId: plugin.pluginId,
          pluginName: plugin.pluginName,
          route: plugin.route as TRoute,
          output,
          metrics: {
            latencyMs: Math.max(0, performance.now() - startedAt),
            routeMatch: isRouteMatch(plugin.route, route),
          },
        };
      }),
    );
  }

  async runSingle<
    TName extends TPlugins[number]['pluginName'],
    TDescriptor extends PluginByName<TPlugins, TName>,
  >(
    name: NoInfer<TName>,
    input: TDescriptor['input'],
    context: IntentPluginContext<TDescriptor['route']>,
  ): Promise<Result<{
    readonly plugin: TDescriptor['pluginName'];
    readonly output: RouteOutput<TPlugins, TDescriptor['route']>;
  }, Error>> {
    const target = this.#plugins.find((plugin): plugin is TDescriptor => plugin.pluginName === name);
    if (!target) {
      return fail(new Error(`plugin ${String(name)} not found`));
    }

    if (!target.canRun(context)) {
      return fail(new Error(`plugin ${String(name)} guard denied run`));
    }

    const scope = createAsyncScope();
    using _scope = scope;
    scope.adopt(
      {
        scopeLabel: toScopeLabel(target.route),
        plugin: target.pluginName,
      },
      () => {},
    );

    try {
      const output = (await Promise.resolve(target.run(input as never, context))) as RouteOutput<
        TPlugins,
        TDescriptor['route']
      >;
      return ok({
        plugin: target.pluginName,
        output,
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('plugin execution failed');
      return fail(error);
    }
  }

  inferSignals(routeInput: IntentInput, context: IntentPluginContext): readonly IntentSignal[] {
    return projectSignals(
      {
        name: 'intent-graph-runtime',
        nodes: [],
        edges: [],
        tags: { route: routeInput.kind },
      },
      context,
    );
  }

  scoreGraph(snapshot: IntentGraphSnapshot<unknown>): number {
    return scoreGraph(snapshot);
  }
}

export const makeIntentPluginRegistry = <
  const TPlugins extends readonly IntentRegistryPlugin[],
>(
  plugins: TPlugins,
) => new IntentPluginRegistry<TPlugins>(plugins);

export const makeRegistryRoute = <TRoute extends string>(route: TRoute): `route:${TRoute}` => `route:${route}`;

export const makeBoundContext = (tenant: string, workspace: string, requestId: string): IntentPluginContext => ({
  tenant: makeIntentTenant(tenant),
  workspace: makeIntentWorkspace(workspace),
  scope: 'runtime',
  traceId: `${tenant}/${workspace}/${requestId}`,
  requestId,
  startedAt: Date.now(),
});

export type RegistryMarker = Brand<string, 'RegistryMarker'>;
