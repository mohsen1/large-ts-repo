import {
  type Brand,
  type NoInfer,
  type PluginId,
  type PluginSignal,
  type PluginOutput,
  type Result,
  fail,
  ok,
} from './types.js';

export type PluginRoute = string;

export interface PluginContext<TRoute extends string> {
  readonly route: TRoute;
  readonly tenant: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface PluginDescriptor<
  TName extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TRoute extends string = string,
> {
  readonly id: PluginId;
  readonly pluginId: PluginId;
  readonly name: TName;
  readonly route: TRoute;
  readonly dependencies: readonly PluginId[];
  readonly tags: readonly string[];
  canRun(context: PluginContext<TRoute>, signal: PluginSignal): boolean;
  process(input: TInput, signal: PluginSignal, context: PluginContext<TRoute>): Promise<Result<TOutput>>;
}

export type PluginInput<TDescriptor extends PluginDescriptor> = TDescriptor extends PluginDescriptor<any, infer TInput, any, any>
  ? TInput
  : never;

export type PluginOutputType<TDescriptor extends PluginDescriptor> = TDescriptor extends PluginDescriptor<any, any, infer TOutput, any>
  ? TOutput
  : never;

export interface PluginResult<TDescriptor extends PluginDescriptor> {
  readonly name: TDescriptor['name'];
  readonly plugin: TDescriptor['pluginId'];
  readonly output: PluginOutputType<TDescriptor>;
}

export type AnyPluginDescriptor = PluginDescriptor<string, unknown, unknown, string>;

interface RouteOutput {
  readonly durationMs?: number;
}

const hasDuration = (value: unknown): value is RouteOutput =>
  typeof value === 'object' && value !== null && 'durationMs' in (value as Record<string, unknown>);

const resolveDuration = (value: unknown): number => {
  if (hasDuration(value)) {
    const next = (value as { durationMs?: unknown }).durationMs;
    if (typeof next === 'number') return next;
  }
  return 0;
};

export class PluginRegistry<TPlugins extends readonly AnyPluginDescriptor[] = readonly AnyPluginDescriptor[]> implements Disposable, AsyncDisposable {
  readonly #plugins: ReadonlyArray<AnyPluginDescriptor>;
  #disposed = false;

  constructor(plugins: NoInfer<TPlugins>) {
    this.#plugins = [...plugins] as ReadonlyArray<AnyPluginDescriptor>;
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

  pluginCount(): number {
    return this.#plugins.length;
  }

  has(id: PluginId): boolean {
    return this.#plugins.some((plugin) => plugin.pluginId === id);
  }

  getByName<TName extends TPlugins[number]['name']>(name: TName): Extract<TPlugins[number], { name: TName }> | undefined {
    const match = this.#plugins.find((plugin) => plugin.name === name);
    return match as Extract<TPlugins[number], { name: TName }> | undefined;
  }

  getByRoute<TRoute extends PluginRoute>(route: TRoute): readonly PluginDescriptor<string, unknown, unknown, TRoute>[] {
    return this.#plugins.filter((plugin): plugin is PluginDescriptor<string, unknown, unknown, TRoute> =>
      plugin.route === route);
  }

  mapByTag(tag: string): readonly AnyPluginDescriptor[] {
    return this.#plugins.filter((plugin) => plugin.tags.includes(tag));
  }

  async execute<TName extends TPlugins[number]['name'],
    TDescriptor extends Extract<TPlugins[number], { name: TName }>,
    TInput extends PluginInput<TDescriptor>,
    TOutput extends PluginOutputType<TDescriptor>,
  >(
    name: TName,
    input: NoInfer<TInput>,
    context: Omit<PluginContext<TPlugins[number]['name'] & string>, 'route'> & { route: PluginRoute },
  ): Promise<Result<PluginOutput<TOutput>>> {
    if (this.#disposed) return fail(new Error('registry disposed'));

    const descriptor = this.#plugins.find((candidate) => candidate.name === name) as TDescriptor | undefined;
    if (!descriptor) return fail(new Error(`plugin ${String(name)} not found`));

    const signal = this.makeSignal(descriptor, context);
    if (!descriptor.canRun(context as PluginContext<string>, signal)) {
      return fail(new Error(`plugin ${String(name)} cannot run in route ${context.route}`));
    }

    const output = await descriptor.process(input as never, signal, context as PluginContext<string>);
    if (!output.ok) return output as Result<PluginOutput<TOutput>>;

    const wrapped: PluginOutput<TOutput> = {
      plugin: descriptor.pluginId,
      output: output.value as TOutput,
      durationMs: resolveDuration(output.value),
    };

    return ok(wrapped);
  }

  async executePath(
    route: PluginRoute,
    input: unknown,
    context: Omit<PluginContext<PluginRoute>, 'route'> & { route: PluginRoute },
  ): Promise<readonly Result<PluginOutput<unknown>>[]> {
    const signal: PluginSignal = {
      plugin: this.#plugins[0]?.pluginId ?? ('' as PluginId),
      phase: route,
      value: context.route.length,
      timestamp: Date.now(),
    };
    const candidates = this.getByRoute(route);
    const output: Result<PluginOutput<unknown>>[] = [];

    for (const candidate of candidates) {
      if (!candidate.canRun(context as PluginContext<string>, signal)) continue;
      const candidateOutput = await candidate.process(input as never, signal, context as PluginContext<string>);
      if (!candidateOutput.ok) {
        output.push(candidateOutput as Result<PluginOutput<unknown>>);
        continue;
      }
      output.push(
        ok({
          plugin: candidate.pluginId,
          output: candidateOutput.value,
          durationMs: resolveDuration(candidateOutput.value),
        }),
      );
    }

    return output;
  }

  register<const TPlugin extends AnyPluginDescriptor>(
    plugin: TPlugin,
  ): PluginRegistry<[...TPlugins, TPlugin]> {
    const next = [...this.#plugins, plugin] as [...TPlugins, TPlugin];
    return new PluginRegistry(next);
  }

  withRouteScope<TRoute extends PluginRoute>(route: TRoute): PluginRegistryScope<TPlugins, TRoute> {
    return new PluginRegistryScope<TPlugins, TRoute>(route, this);
  }

  private makeSignal(
    _plugin: PluginDescriptor,
    context: { route: string },
  ): PluginSignal {
    return {
      plugin: this.#plugins[0]?.pluginId ?? ('' as PluginId),
      phase: context.route,
      value: context.route.length,
      timestamp: Date.now(),
    };
  }
}

export class PluginRegistryScope<TPlugins extends readonly AnyPluginDescriptor[], TRoute extends PluginRoute> {
  constructor(
    public readonly route: TRoute,
    private readonly registry: PluginRegistry<TPlugins>,
  ) {}

  run<TName extends TPlugins[number]['name'],
    TDescriptor extends Extract<TPlugins[number], { name: TName }>,
    TInput extends PluginInput<TDescriptor>,
    TOutput extends PluginOutputType<TDescriptor>,
  >(
    name: TName,
    input: NoInfer<TInput>,
    tenant: string,
    labels: Record<string, string>,
  ): Promise<Result<PluginOutput<TOutput>>> {
    return this.registry.execute(name, input, { tenant, route: this.route, labels });
  }

  path(input: unknown, tenant: string): Promise<readonly Result<PluginOutput<unknown>>[]> {
    return this.registry.executePath(this.route, input, {
      tenant,
      route: this.route,
      labels: { route: this.route },
    });
  }
}
