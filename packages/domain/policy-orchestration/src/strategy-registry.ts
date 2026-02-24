import { NoInfer, Brand } from '@shared/type-level';
import {
  AnyPolicyPlugin,
  PolicyPlugin,
  PolicyPluginContext,
  PolicyPluginId,
  PolicyPluginManifest,
  PolicyPluginRegistry,
  PolicyPluginScope,
  PolicyPluginKind,
} from './plugin-framework';
import {
  StrategyNamespace,
  StrategyRoute,
  StrategySignal,
  StrategyPlanContext,
  StrategyPluginKind,
  createStrategyTraceId,
  buildStrategyRoute,
} from './strategy-types';

type StrategyPluginDescriptor = `${StrategyNamespace}:${StrategyPluginKind}`;
type RegistryScope = `scope:${string}`;
type TraceEnvelope = { readonly trace: string; readonly createdAt: string };

export type StrategyPluginTuple<T extends readonly AnyPolicyPlugin[]> = T extends readonly [
  infer Head extends AnyPolicyPlugin,
  ...infer Tail extends readonly AnyPolicyPlugin[],
]
  ? readonly [Head, ...StrategyPluginTuple<Tail>]
  : [];

export interface StrategyRegistryOptions {
  readonly namespace: StrategyNamespace;
  readonly scope: RegistryScope;
  readonly maxHistory: number;
}

export interface StrategyRegistryRunRecord<TInput, TOutput> {
  readonly traceId: ReturnType<typeof createStrategyTraceId>;
  readonly pluginId: PolicyPluginId;
  readonly route: StrategyRoute;
  readonly input: TInput;
  readonly output: TOutput;
  readonly startedAt: string;
  readonly durationMs: number;
}

export interface StrategyRegistrySnapshot<TCatalog extends readonly AnyPolicyPlugin[]> {
  readonly namespace: StrategyNamespace;
  readonly pluginCount: number;
  readonly activeScopes: readonly RegistryScope[];
  readonly catalog: TCatalog;
  readonly runCount: number;
  readonly traceEnvelope: TraceEnvelope;
}

export interface StrategyRegistryHandle<TPlugin extends AnyPolicyPlugin> extends Disposable {
  readonly pluginId: TPlugin['pluginId'];
  readonly manifest: PolicyPluginManifest<TPlugin['name'], TPlugin['kind']>;
}

export type StrategyRegistryMap<T extends readonly AnyPolicyPlugin[]> = {
  [P in T[number] as `plugin:${P['kind']}:${P['name']}`]: P['pluginId'];
};
type StrategyExecutionContext = StrategyPlanContext &
  Pick<PolicyPluginContext, 'scope' | 'runId' | 'startedAt' | 'metadata'>;

const toSignal = <T extends string>(route: StrategyRoute, scope: string): StrategySignal =>
  `signal:${route}:${scope}` as StrategySignal;

const defaultOptions = {
  namespace: 'policy' as StrategyNamespace,
  scope: 'scope:policy-console' as RegistryScope,
  maxHistory: 256,
} satisfies StrategyRegistryOptions;

const traceToManifest = <TPlugin extends AnyPolicyPlugin>(
  plugin: TPlugin,
): PolicyPluginManifest<TPlugin['name'], TPlugin['kind']> => ({
  pluginId: plugin.pluginId,
  kind: plugin.kind as TPlugin['kind'],
  name: plugin.name,
  version: plugin.version,
  scope: plugin.scope,
});

export class StrategyRegistry<TCatalog extends readonly AnyPolicyPlugin[]> implements AsyncDisposable {
  readonly #registry: PolicyPluginRegistry<TCatalog>;
  readonly #options: StrategyRegistryOptions;
  readonly #history: StrategyRegistryRunRecord<unknown, unknown>[] = [];
  #closed = false;
  #nextRoute: number = 0;

  public constructor(catalog: TCatalog, options: Partial<StrategyRegistryOptions> = {}) {
    this.#options = { ...defaultOptions, ...options };
    this.#registry = new PolicyPluginRegistry(catalog);
  }

  public get catalog(): TCatalog {
    return [...this.#registry.state.plugins] as unknown as TCatalog;
  }

  public get scopeMap(): StrategyRegistryMap<TCatalog> {
    const map: Record<string, PolicyPluginId> = {};
    for (const plugin of this.#registry.state.plugins) {
      map[`plugin:${plugin.kind}:${plugin.name}`] = plugin.pluginId;
    }
    return map as unknown as StrategyRegistryMap<TCatalog>;
  }

  public get snapshot(): StrategyRegistrySnapshot<TCatalog> {
    const scope = this.#registry.state.pluginIds.map((id) => String(id));
    return {
      namespace: this.#options.namespace,
      pluginCount: this.#registry.state.total,
      activeScopes: scope.map((id) => `scope:${id}` as RegistryScope),
      catalog: this.catalog,
      runCount: this.#history.length,
      traceEnvelope: {
        trace: createStrategyTraceId(`registry-${this.#nextRoute}`),
        createdAt: new Date().toISOString(),
      },
    };
  }

  public get kind(): PolicyPluginKind {
    const seed = this.#options.namespace;
    return `${seed}-plugin` as PolicyPluginKind;
  }

  public list(scope?: PolicyPluginScope, names?: readonly string[]): TCatalog {
    const scopePlugins = scope
      ? (this.#registry.list({ scopes: [scope] }) as TCatalog)
      : (this.#registry.state.plugins as unknown as TCatalog);
    if (!names?.length) {
      return scopePlugins;
    }
    return (scopePlugins.filter((plugin) => names.includes(plugin.name)) as unknown) as TCatalog;
  }

  public register<TPlugin extends AnyPolicyPlugin>(plugin: TPlugin): StrategyRegistryHandle<TPlugin> {
    const catalog = this.#registry.register(plugin);
    return {
      pluginId: plugin.pluginId,
      manifest: traceToManifest(plugin),
      [Symbol.dispose]() {
        catalog[Symbol.dispose]();
      },
    };
  }

  public async execute<TSeed>(
    scope: PolicyPluginScope,
    plugins: readonly AnyPolicyPlugin[],
    seed: NoInfer<TSeed>,
    context: StrategyExecutionContext,
  ): Promise<TSeed> {
    const candidate = plugins.length > 0 ? plugins : this.list(scope);
    const stack = new AsyncDisposableStack();
    const activeScope = this.#registry.list({ scopes: [scope] });
    const route = buildStrategyRoute(
      context.namespace,
      context.requestId.includes(':') ? 'execute' : 'observe',
      context.requestId,
    );
    const selected = candidate.length > 0 ? candidate : activeScope;
    const trace = createStrategyTraceId(`${route}#${this.#nextRoute++}`);

    await using _ = stack.use({ [Symbol.asyncDispose]: async () => Promise.resolve() } as unknown as AsyncDisposable);
    const signal = toSignal(route, scope);
    const next = selected.length === 0 ? this.catalog : selected;

    let current = seed;
    for (const plugin of next) {
      const start = performance.now();
      const output = await plugin.run(current as never, {
        ...context,
        tenantId: context.tenantId,
        orchestratorId: context.requestId,
        runId: trace,
        scope,
        startedAt: new Date().toISOString(),
        metadata: {
          route,
          trace,
          signal,
          seed: context.requestId,
        },
      } satisfies StrategyPluginRunContext);
      this.#registry.record(plugin.pluginId, current, output);
      this.#history.unshift({
        traceId: trace,
        pluginId: plugin.pluginId,
        route,
        input: current,
        output,
        startedAt: new Date().toISOString(),
        durationMs: performance.now() - start,
      });
      if (this.#history.length > this.#options.maxHistory) {
        this.#history.pop();
      }
      current = output;
    }

    await stack.disposeAsync();
    return current as TSeed;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#registry[Symbol.asyncDispose]();
    this.#history.length = 0;
  }
}

type StrategyPluginRunContext = Omit<PolicyPluginContext, 'metadata'> & {
  readonly metadata: PolicyPluginContext['metadata'] & {
    readonly route: StrategyRoute;
    readonly trace: string;
    readonly signal: StrategySignal;
    readonly seed: string;
  };
};
