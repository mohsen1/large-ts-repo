import {
  Brand,
  EventCatalog,
  EventMapEntry,
  InferPromise,
  IsoTimestamp,
  isTemporalKind,
  NoInfer,
  Normalize,
  PickPath,
  StageId,
  StageMetadata,
} from './types';

export interface TemporalPluginContext {
  readonly runId: Brand<string, 'RunId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly at: IsoTimestamp;
}

export interface TemporalPluginDefinition<
  TName extends string,
  TInput,
  TOutput,
  TConfig = Record<string, unknown>,
> {
  readonly name: `plugin:${TName}`;
  readonly phase: `phase:${string}`;
  readonly config: TConfig;
  readonly inputSchema: (value: unknown) => value is TInput;
  execute(input: NoInfer<TInput>, context: TemporalPluginContext): Promise<TOutput>;
}

export type PluginDefinitionShape = {
  readonly name: `plugin:${string}`;
  readonly phase: `phase:${string}`;
  readonly config: Record<string, unknown>;
  readonly inputSchema: (value: unknown) => boolean;
  execute(input: unknown, context: TemporalPluginContext): Promise<unknown>;
};

export type ExtractPluginOutput<TDefinition> = TDefinition extends TemporalPluginDefinition<
  infer _TName,
  infer _TInput,
  infer TOutput,
  infer _TConfig
>
  ? TOutput
  : never;

export type ExtractPluginInput<TDefinition> = TDefinition extends TemporalPluginDefinition<
  infer _TName,
  infer TInput,
  infer _TOutput,
  infer _TConfig
>
  ? TInput
  : never;

export type PluginDefinitionMap = Readonly<Record<string, PluginDefinitionShape>>;

export type PluginOutputByName<TMap extends PluginDefinitionMap, TName extends keyof TMap & string> =
  TMap[TName] extends TemporalPluginDefinition<infer _N, infer _I, infer O, infer _C> ? O : never;

export type PluginEventByName<TMap extends PluginDefinitionMap, TName extends keyof TMap & string> =
  TemporalPluginDefinition<TName, ExtractPluginInput<TMap[TName]>, PluginOutputByName<TMap, TName>>;

export type PluginName<TMap extends PluginDefinitionMap> = Extract<keyof TMap, string>;

export type PluginManifest<TMap extends PluginDefinitionMap> =
  {
    [K in PluginName<TMap>]: {
      readonly key: K;
      readonly definition: TMap[K];
      readonly phase: TMap[K]['phase'];
    };
  }[PluginName<TMap>];

export type PluginEvent<TMap extends PluginDefinitionMap> = EventCatalog<{
  [K in PluginName<TMap> as TMap[K]['name']]: PluginOutputByName<TMap, K>;
}>;

class FallbackAsyncDisposableStack {
  readonly #resources: Array<() => Promise<void> | void> = [];
  #disposed = false;

  use<T>(value: T): T {
    const synchronous = value as { [Symbol.dispose]?: () => void };
    const asynchronous = value as { [Symbol.asyncDispose]?: () => Promise<void> };

    if (typeof synchronous[Symbol.dispose] === 'function') {
      this.#resources.push(() => synchronous[Symbol.dispose]?.());
    }

    if (typeof asynchronous[Symbol.asyncDispose] === 'function') {
      this.#resources.push(() => asynchronous[Symbol.asyncDispose]?.());
    }

    return value;
  }

  [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    for (const resource of this.#resources.toReversed()) {
      resource();
    }
    this.#resources.length = 0;
  }

  [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }

    this.#disposed = true;
    return Promise.all(this.#resources.toReversed().map((resource) => resource())).then(() => {
      this.#resources.length = 0;
    });
  }
}

const createStackCtor = (): { new (): AsyncDisposableStack } => {
  const NativeStack = (globalThis as { AsyncDisposableStack?: { new (): AsyncDisposableStack } }).AsyncDisposableStack;
  if (NativeStack) {
    return NativeStack;
  }
  return FallbackAsyncDisposableStack as unknown as { new (): AsyncDisposableStack };
};

export class TemporalPluginRegistry<TPlugins extends PluginDefinitionMap> {
  readonly #plugins = new Map<PluginName<TPlugins>, TPlugins[PluginName<TPlugins>]>();
  readonly #stack = new (createStackCtor())();

  constructor(initial: readonly TPlugins[PluginName<TPlugins>][]) {
    for (const plugin of initial) {
      this.register(plugin);
    }
  }

  register<TName extends PluginName<TPlugins>>(definition: TPlugins[TName]): this {
    const pluginName = definition.name as PluginName<TPlugins>;
    this.#plugins.set(pluginName, definition as TPlugins[PluginName<TPlugins>]);
    this.#stack.use({
      [Symbol.dispose](): void {
        // disposal token is no-op for registration-only entries
      },
    });

    return this;
  }

  get size(): number {
    return this.#plugins.size;
  }

  has<TName extends PluginName<TPlugins>>(name: TName): boolean {
    return this.#plugins.has(name);
  }

  manifests(): ReadonlyArray<Normalize<PluginManifest<TPlugins>>> {
    const manifests: Array<PluginManifest<TPlugins>> = [];
    const phases = ['phase:prep', 'phase:run', 'phase:verify'];

    for (const phase of phases) {
      const entries = [...this.#plugins.values()]
        .filter((plugin) => plugin.phase === phase)
        .map((plugin) => ({
          key: plugin.name as PluginName<TPlugins>,
          definition: plugin,
          phase: plugin.phase,
        }))
        .toSorted((left, right) => left.key.localeCompare(right.key));

      manifests.push(...entries);
    }

    return manifests as ReadonlyArray<Normalize<PluginManifest<TPlugins>>>;
  }

  async run<TName extends PluginName<TPlugins>, const TInput = ExtractPluginInput<TPlugins[TName]>>(
    name: TName,
    input: NoInfer<TInput>,
    context: TemporalPluginContext,
  ): Promise<PluginOutputByName<TPlugins, TName>> {
    const definition = this.#plugins.get(name as PluginName<TPlugins>) as TPlugins[TName] | undefined;

    if (!definition) {
      const candidates = [...this.#plugins.keys()].toSorted().join(', ');
      throw new Error(`plugin not found: ${name}; known=${candidates}`);
    }

    if (!definition.inputSchema(input)) {
      throw new Error(`plugin input mismatch: ${name}:${String(context.runId)}`);
    }

    const result = (await definition.execute(input as ExtractPluginInput<TPlugins[TName]>, context)) as
      PluginOutputByName<TPlugins, TName>;

    return result;
  }

  async runAll<TInput, TName extends PluginName<TPlugins>[]>(
    names: readonly [...TName],
    input: NoInfer<TInput>,
    context: TemporalPluginContext,
  ): Promise<readonly [
    ...{
      [TIndex in keyof TName]: TName[TIndex] extends PluginName<TPlugins>
        ? PluginOutputByName<TPlugins, TName[TIndex]>
        : never;
    },
  ]> {
    const outputs: unknown[] = [];
    let cursor = input as TInput;

    for (const name of names) {
      const output = await this.run(name, cursor as never, context);
      outputs.push(output);
      cursor = output as TInput;
    }

    return outputs as [
      ...{
        [TIndex in keyof TName]: TName[TIndex] extends PluginName<TPlugins>
          ? PluginOutputByName<TPlugins, TName[TIndex]>
          : never;
      },
    ];
  }

  diagnostics(): ReadonlyArray<{ readonly kind: `temporal:${string}`; readonly payload: unknown }> {
    const timeline = [...this.#plugins.values()]
      .map((plugin) => ({
        kind: `temporal:${plugin.name}` as `temporal:${string}`,
        payload: {
          phase: plugin.phase,
          config: plugin.config,
          registered: true,
        },
      }))
      .toSorted((left, right) => left.kind.localeCompare(right.kind));

    return timeline;
  }

  toSchema(): readonly [
    readonly { readonly kind: `temporal:registration`; readonly payload: StageMetadata }[],
    readonly StageMetadata[],
  ] {
    const stages = this.manifests().map((item): StageMetadata => {
      return {
        id: `${item.definition.name}:stage` as StageId,
        description: `phase=${item.phase} plugin=${item.key}`,
        tags: new Set([item.phase, item.definition.name]),
        sequence: Number(item.key.length),
      };
    });

    return [
      stages
        .map((stage) => ({
          kind: 'temporal:registration' as const,
          payload: stage,
        }))
        .toSorted((left, right) => left.kind.localeCompare(right.kind)),
      stages,
    ];
  }

  peek<TName extends PluginName<TPlugins>>(name: TName): TPlugins[TName] | undefined {
    return this.#plugins.get(name as PluginName<TPlugins>) as TPlugins[TName] | undefined;
  }

  stageByPrefix(prefix: string): readonly TPlugins[PluginName<TPlugins>][] {
    const out: TPlugins[PluginName<TPlugins>][] = [];
    for (const plugin of this.#plugins.values()) {
      if (plugin.phase.startsWith(prefix)) {
        out.push(plugin);
      }
    }

    return out.toSorted((left, right) => left.name.localeCompare(right.name));
  }

  [Symbol.dispose](): void {
    (this.#stack as { [Symbol.dispose]?: () => void })[Symbol.dispose]?.();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return (this.#stack as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose]?.() ?? Promise.resolve();
  }
}

export const mergeStages = <TStage extends StageMetadata>(stages: readonly TStage[]): readonly TStage[] =>
  stages.toSorted((left, right) => left.sequence - right.sequence);

export const pickByPath = <TSource, const TPath extends string>(
  source: TSource,
  path: NoInfer<TPath>,
): PickPath<TSource, TPath> => {
  const parts = path.split('.') as Array<keyof TSource & string>;
  let cursor: unknown = source;

  for (const part of parts) {
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return cursor as PickPath<TSource, TPath>;
};
