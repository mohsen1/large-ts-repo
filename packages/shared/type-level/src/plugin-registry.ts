export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };

type NoInfer<T> = [T][T extends any ? 0 : never];

export type DeepReadonlyMap<T> = T extends (...args: any[]) => unknown
  ? T
  : T extends readonly [infer Head, ...infer Tail]
    ? readonly [DeepReadonlyMap<Head>, ...{ [K in keyof Tail]: DeepReadonlyMap<Tail[K]> }]
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepReadonlyMap<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonlyMap<T[K]> }
        : T;

export type ReplacePrefix<TRecord extends Record<PropertyKey, unknown>, Prefix extends string> = {
  [K in keyof TRecord as K extends `${Prefix}${infer Rest}` ? Rest : never]: TRecord[K];
};

export type StripLeading<T extends string> = T extends `_${infer Tail}` ? Tail : T;

export type JoinTuple<T extends readonly string[], Separator extends string = '.'> =
  T extends readonly [infer H]
    ? H & string
    : T extends readonly [infer H, ...infer R]
      ? H extends string
        ? R extends readonly string[]
          ? `${H}${Separator}${JoinTuple<R, Separator>}`
          : string
        : string
      : '';

export type RecursiveTupleKeys<T> = T extends readonly [infer H, ...infer R]
  ? [H & PropertyKey, ...RecursiveTupleKeys<R>]
  : [];

export type ExpandPluginPath<
  T,
  Prefix extends string = '',
> = T extends Date | string | number | bigint | boolean | symbol | null | undefined
  ? never
  : T extends readonly (infer U)[]
    ? `${Prefix}[${number}]` | (ExpandPluginPath<U, Prefix> extends infer Inner
      ? Inner extends string
        ? `${Prefix}[${number}].${Inner}`
        : never
      : never)
    : T extends object
      ? {
          [K in keyof T & string]: K extends `__${string}`
            ? never
            : ExpandPluginPath<T[K], K extends Prefix | '' ? K : `${Prefix}.${K}`>;
        }[keyof T & string]
      : never;

export type RegistryTemplate<T extends string> = `@recovery/${T}`;

export type PluginName<T extends string> = RegistryTemplate<T>;

export interface PluginTrace {
  readonly namespace: string;
  readonly correlationId: Brand<string, 'plugin-correlation-id'>;
  readonly startedAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PluginResult<T> {
  readonly status: 'ok' | 'skip' | 'error';
  readonly payload?: T;
  readonly reason?: string;
  readonly error?: Error;
}

export interface PluginStepInput<TInput> {
  readonly kind: string;
  readonly phase: string;
  readonly createdAt: Date;
  readonly payload: TInput;
  readonly tags: readonly string[];
}

export interface PluginStepOutput<TInput, TOutput> extends PluginStepInput<TInput> {
  readonly output: TOutput;
  readonly trace: PluginTrace;
}

export interface RegistryPlugin<
  TName extends string,
  TInput,
  TOutput,
  TTag extends PluginName<TName> = PluginName<TName>,
> {
  readonly id: Brand<TTag, 'plugin-id'>;
  readonly name: TName;
  readonly version: `${number}.${number}.${number}`;
  readonly dependsOn: readonly Brand<string, 'plugin-id'>[];
  readonly supports: readonly string[];
  canProcess(input: TInput, trace: PluginTrace): boolean;
  process(input: PluginStepInput<TInput>, trace: PluginTrace): Promise<PluginResult<TOutput>>;
}

export type PluginError<TInput, TOutput> = RegistryPlugin<TInput extends string ? TInput : string, TInput, TOutput>;

export type PluginRecord<TPlugins extends readonly RegistryPlugin<string, any, any, any>[]> = {
  [P in TPlugins[number] as P['id']]: P;
};

export type PickByPhase<TPlugins extends readonly RegistryPlugin<string, any, any, any>[], TPhase extends string> =
  TPlugins extends readonly [infer Head, ...infer Tail]
    ? Head extends RegistryPlugin<string, any, any, any>
      ? (TPhase extends Head['supports'][number]
        ? [Head, ...PickByPhase<Extract<Tail, readonly RegistryPlugin<string, any, any, any>[]>, TPhase>]
        : PickByPhase<Extract<Tail, readonly RegistryPlugin<string, any, any, any>[]>, TPhase>)
      : PickByPhase<Extract<Tail, readonly RegistryPlugin<string, any, any, any>[]>, TPhase>
    : [];

export type HandlerInput<T> = {
  readonly value: T;
  readonly path: ExpandPluginPath<T>;
};

export class Registry<TPlugins extends readonly RegistryPlugin<string, any, any, any>[]> implements Disposable {
  #byId = new Map<string, TPlugins[number]>();
  #ordered: TPlugins[number][] = [];
  #disposed = false;

  constructor(plugins: NoInfer<TPlugins>) {
    for (const plugin of plugins) {
      this.#byId.set(plugin.id, plugin);
    }
    this.#ordered = [...plugins];
  }

  register<const TName extends string, TInput, TOutput, TTag extends PluginName<TName>>(
    plugin: RegistryPlugin<TName, TInput, TOutput, TTag>,
  ): void {
    if (this.#disposed) {
      throw new Error('cannot register plugin on disposed registry');
    }
    this.#byId.set(plugin.id, plugin as TPlugins[number]);
    this.#ordered = [...this.#ordered, plugin as TPlugins[number]];
  }

  has(id: Brand<string, 'plugin-id'>): boolean {
    return this.#byId.has(id);
  }

  get<TPlugin extends TPlugins[number]['id']>(id: TPlugin): Extract<TPlugins[number], { id: TPlugin }> | undefined {
    return this.#byId.get(id) as Extract<TPlugins[number], { id: TPlugin }> | undefined;
  }

  getAll(): readonly TPlugins[number][] {
    return [...this.#ordered];
  }

  map<R>(mapper: (plugin: TPlugins[number], index: number) => R): R[] {
    return this.#ordered.map(mapper);
  }

  [Symbol.iterator](): IterableIterator<TPlugins[number]> {
    return this.#ordered[Symbol.iterator]();
  }

  asRecord(): PluginRecord<TPlugins> {
    const result = {} as PluginRecord<TPlugins>;
    for (const plugin of this.#ordered) {
      result[plugin.id as keyof PluginRecord<TPlugins>] = plugin;
    }
    return result;
  }

  filterByPath<TPath extends string>(path: TPath): readonly TPlugins[number][] {
    return this.#ordered.filter((plugin): plugin is TPlugins[number] =>
      plugin.supports.includes(path));
  }

  dispose(): void {
    this.#disposed = true;
    this.#ordered = [];
    this.#byId.clear();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

export interface PluginSessionOptions {
  readonly name: string;
  readonly capacity: number;
}

export class PluginSession<TPlugins extends readonly RegistryPlugin<string, any, any, any>[]>
  implements Disposable
{
  private readonly registry: Registry<TPlugins>;
  private readonly options: PluginSessionOptions;

  constructor(plugins: TPlugins, options: PluginSessionOptions) {
    this.registry = new Registry(plugins);
    this.options = options;
  }

  registryPlugins(): Registry<TPlugins> {
    return this.registry;
  }

  pluginSummary(): string[] {
    return this.registry
      .map((plugin) => `${this.options.name}(${this.options.capacity}): ${plugin.name}@${plugin.version}`)
      .slice(0, this.options.capacity);
  }

  [Symbol.dispose](): void {
    this.registry.dispose();
  }
}

export class PluginLease<TPlugins extends readonly RegistryPlugin<string, any, any, any>[]> {
  constructor(
    private readonly session: PluginSession<TPlugins>,
    private readonly trace: PluginTrace,
  ) {}

  get registry(): Registry<TPlugins> {
    return this.session.registryPlugins();
  }

  getSnapshot(): string {
    return JSON.stringify({
      namespace: this.trace.namespace,
      startedAt: this.trace.startedAt,
      pluginCount: this.registry.getAll().length,
    });
  }

  close(): void {
    this.session[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export function createPluginSession<const TPlugins extends readonly RegistryPlugin<string, any, any, any>[]>(
  plugins: TPlugins,
  options: PluginSessionOptions,
): PluginLease<TPlugins> {
  const trace: PluginTrace = {
    namespace: options.name,
    correlationId: `${options.name}-${Date.now()}` as Brand<string, 'plugin-correlation-id'>,
    startedAt: Date.now(),
    metadata: {},
  };
  const session = new PluginSession(plugins, options);
  return new PluginLease(session, trace);
}
