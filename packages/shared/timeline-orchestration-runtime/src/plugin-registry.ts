import { type Brand, type Prettify } from '@shared/type-level';

export type PluginTemplate<TName extends string> = `timeline-plugin/${TName}`;

export type PluginId<TName extends string> = Brand<PluginTemplate<TName>, 'plugin'>;

export type RuntimeTrace = {
  readonly namespace: string;
  readonly invocationId: Brand<string, 'timeline-invocation-id'>;
  readonly invokedAt: number;
  readonly source: string;
};

export interface PluginInput<TPayload> {
  readonly payload: TPayload;
  readonly trace: RuntimeTrace;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PluginOutput<TPayload> {
  readonly status: 'ok' | 'skipped' | 'error';
  readonly output?: TPayload;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface TimelinePlugin<TName extends string, TInput, TOutput> {
  readonly id: PluginId<TName>;
  readonly name: TName;
  readonly supports: readonly string[];
  readonly dependsOn: readonly Brand<string, 'plugin'>[];
  readonly version: `${number}.${number}.${number}`;
  canHandle(input: PluginInput<TInput>): input is PluginInput<TInput>;
  process(input: PluginInput<TInput>, trace: RuntimeTrace): Promise<PluginOutput<TOutput>>;
}

type AnyPlugin = TimelinePlugin<string, unknown, unknown>;

type PluginRecord<TPlugins extends readonly AnyPlugin[]> = Partial<
  Record<TPlugins[number]['id'] & string, TPlugins[number]>
>;

type PluginOutputForId<TPlugins extends readonly AnyPlugin[], TId extends keyof PluginRecord<TPlugins>> =
  Extract<TPlugins[number], { id: TId }> extends TimelinePlugin<string, infer TInput, infer TOutput>
    ? [TInput, TOutput]
    : [unknown, unknown];

type PluginUnionById<TPlugins extends readonly AnyPlugin[], TId extends keyof PluginRecord<TPlugins>> =
  Extract<TPlugins[number], { id: TId }>;

export type PluginResult<T> = PluginOutput<T> & { readonly plugin: Brand<string, 'plugin'> };

type AnyPluginSession = {
  [Symbol.dispose](): void;
  [Symbol.iterator](): IterableIterator<AnyPlugin>;
  all(): readonly AnyPlugin[];
  asMap(): unknown;
};

export class RegistrySession<TPlugins extends readonly AnyPlugin[]> {
  readonly #plugins: PluginRecord<TPlugins>;
  readonly #ordered: TPlugins[number][];

  constructor(plugins: NoInfer<TPlugins>) {
    this.#ordered = [...plugins];
    this.#plugins = Object.create(null);

    for (const plugin of plugins) {
      this.#plugins[plugin.id as TPlugins[number]['id'] & string] = plugin;
    }
  }

  all(): readonly TPlugins[number][] {
    return [...this.#ordered];
  }

  lookup<TId extends keyof PluginRecord<TPlugins>>(pluginId: TId): PluginUnionById<TPlugins, TId> | undefined {
    return this.#plugins[pluginId as keyof PluginRecord<TPlugins>] as
      | PluginUnionById<TPlugins, TId>
      | undefined;
  }

  with<TName extends string>(namespace: TName): readonly TPlugins[number][] {
    return this.#ordered.filter((plugin) => plugin.id.startsWith(`timeline-plugin/${namespace}`));
  }

  supports(phase: string): readonly TPlugins[number][] {
    return this.#ordered.filter((plugin) => plugin.supports.includes(phase));
  }

  asMap(): Prettify<PluginRecord<TPlugins>> {
    return { ...this.#plugins } as PluginRecord<TPlugins>;
  }

  [Symbol.iterator](): IterableIterator<TPlugins[number]> {
    return this.#ordered[Symbol.iterator]();
  }

  [Symbol.dispose](): void {
    this.#ordered.splice(0);
  }

  async invoke<TId extends keyof PluginRecord<TPlugins>>(
    pluginId: TId,
    input: PluginInput<PluginOutputForId<TPlugins, TId>[0]>,
  ): Promise<PluginResult<PluginOutputForId<TPlugins, TId>[1]>> {
    const plugin = this.lookup(pluginId);
    if (!plugin) {
      return {
        status: 'error',
        plugin: pluginId as Brand<string, 'plugin'>,
        message: `plugin not found: ${String(pluginId)}`,
      };
    }

    const trace: RuntimeTrace = {
      namespace: plugin.name,
      invocationId: `${plugin.name}:${Date.now()}` as Brand<string, 'timeline-invocation-id'>,
      invokedAt: Date.now(),
      source: 'registry-session',
    };

    if (!plugin.canHandle(input as PluginInput<unknown>)) {
      return {
        status: 'skipped',
        plugin: plugin.id as Brand<string, 'plugin'>,
        message: 'plugin cannot process this input',
      };
    }

    const output = await plugin.process(input as PluginInput<unknown>, trace);
    return {
      ...output,
      plugin: plugin.id as Brand<string, 'plugin'>,
    };
  }

  async invokeAll<TInput>(
    phase: string,
    payload: TInput,
  ): Promise<Array<PluginOutput<unknown> & { plugin: Brand<string, 'plugin'> }>> {
    const queue = this.supports(phase);
    const trace: RuntimeTrace = {
      namespace: phase,
      invocationId: `batch:${Date.now()}` as Brand<string, 'timeline-invocation-id'>,
      invokedAt: Date.now(),
      source: 'registry-batch',
    };

    const input: PluginInput<TInput> = {
      payload,
      trace,
      metadata: { phase },
    };

    const result: Array<PluginOutput<unknown> & { plugin: Brand<string, 'plugin'> }> = [];
    for (const plugin of queue) {
      if (plugin.canHandle(input)) {
        const output = await plugin.process(input, trace);
        result.push({ ...output, plugin: plugin.id as Brand<string, 'plugin'> });
      }
    }
    return result;
  }
}

export function createRegistry<TPlugins extends readonly AnyPlugin[]>(
  plugins: TPlugins,
): RegistrySession<TPlugins> {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (seen.has(plugin.id as string)) {
      throw new Error(`duplicate plugin id: ${plugin.id}`);
    }
    seen.add(plugin.id as string);
  }
  return new RegistrySession(plugins);
}

export const pluginSupportKeys = {
  simulate: 'simulate',
  plan: 'plan',
  validate: 'validate',
  adapt: 'adapt',
} as const satisfies Record<string, string>;
