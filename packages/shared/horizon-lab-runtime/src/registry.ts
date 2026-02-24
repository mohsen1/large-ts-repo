import type { JsonValue, Prettify } from '@shared/type-level';
import type {
  StageName,
  HorizonSessionId,
  HorizonRunId,
  EventByStage,
  HorizonTenant,
  HorizonEvent,
  StageLabel,
  TimelineSummary,
} from './runtime-types.js';

export interface PluginContext<TPayload = JsonValue> {
  readonly tenant: HorizonTenant;
  readonly runId: HorizonRunId;
  readonly sessionId: HorizonSessionId;
  readonly metadata: Record<string, JsonValue>;
  readonly payload: TPayload;
}

export interface PluginFactory<TStage extends string, TInput, TOutput> {
  readonly kind: TStage;
  readonly label: StageLabel<TStage>;
  readonly stageLabel: StageLabel<TStage>;
  readonly describe: (input: Readonly<TInput>) => string;
  readonly create: (input: Readonly<TInput>) => PluginStateMachine<TInput, TOutput>;
  readonly defaults: TInput;
  readonly metadataSchema?: Record<string, JsonValue>;
}

export interface PluginStateMachine<TInput, TOutput> {
  readonly initialize: (context: PluginContext<TInput>) => void;
  readonly next: (state: TInput) => Promise<TOutput>;
  readonly finalize: (state: TInput) => TOutput;
}

export interface PluginRuntime<TInput, TOutput> {
  readonly pluginKind: string;
  readonly stageLabel: StageLabel<string>;
  readonly execute: (input: readonly TInput[], context: PluginContext<TInput>) => Promise<readonly TOutput[]>;
}

export type PluginFactoryCollection<T extends readonly PluginFactory<any, any, any>[]> = {
  [P in T[number] as P['kind']]: P;
};

export type PluginByKind<
  TCollection extends PluginFactoryCollection<readonly PluginFactory<any, any, any>[]>,
  TKind extends keyof TCollection,
> = TCollection[TKind & keyof TCollection];

type PluginTupleResultEntry<T extends PluginFactory<any, any, any>> =
  T extends PluginFactory<infer Kind, infer Input, infer Output>
    ? {
        readonly kind: Kind;
        readonly output: PluginRuntime<Input, Output>;
      }
    : never;

export type PluginTupleResult<T extends readonly PluginFactory<any, any, any>[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends PluginFactory<any, any, any>
      ? readonly [
          PluginTupleResultEntry<Head>,
          ...PluginTupleResult<
            Tail extends readonly PluginFactory<any, any, any>[] ? Tail : []
          >
        ]
      : readonly []
    : readonly [];

export type FactoriesByKind<TFactories extends readonly PluginFactory<any, any, any>[]> = {
  [Factory in TFactories[number] as Factory['kind']]: Factory[];
};

export type StageEventMap<TFactories extends readonly PluginFactory<any, any, any>[]> = {
  [K in TFactories[number]['kind']]: readonly HorizonEvent<K & string, JsonValue>[];
};

type MergeFactoryTuples<
  TLeft extends readonly PluginFactory<any, any, any>[],
  TRight extends readonly PluginFactory<any, any, any>[],
> = readonly [...TLeft, ...TRight];

type RuntimeInput<TFactory extends PluginFactory<any, any, any>> = TFactory extends PluginFactory<any, infer TInput, any> ? TInput : never;
type RuntimeOutput<TFactory extends PluginFactory<any, any, any>> = TFactory extends PluginFactory<any, any, infer TOutput> ? TOutput : never;

type TimelineSummaryMap<T extends readonly StageName[]> = {
  [K in T[number]]: number;
};

export class HorizonPluginRegistry<TFactories extends readonly PluginFactory<any, any, any>[]> {
  readonly #factories = new Map<string, TFactories[number]>();
  readonly #index = new Map<StageName, TFactories[number][]>();
  readonly #entries: TFactories;

  constructor(
    entries: TFactories,
    private readonly onRegister?: (entry: TFactories[number]) => void,
  ) {
    this.#entries = entries;
  }

  register<TFactory extends TFactories[number]>(factory: TFactory) {
    if (this.#factories.has(factory.kind)) {
      throw new Error(`plugin already registered: ${String(factory.kind)}`);
    }

    const current = this.#factories.get(factory.kind);
    if (current) {
      throw new Error(`collision for plugin ${String(factory.kind)}`);
    }

    this.#factories.set(factory.kind, factory);

    const stage = factory.stageLabel as StageName;
    const bucket = this.#index.get(stage) ?? [];
    this.#index.set(stage, [...bucket, factory]);
    this.onRegisterFactory(factory);
    return this as HorizonPluginRegistry<TFactories>;
  }

  bootstrap() {
    for (const factory of this.#entries) {
      this.register(factory as TFactories[number]);
    }
  }

  private onRegisterFactory(factory: TFactories[number]) {
    this.onRegister?.(factory);
  }

  allEntries(): readonly TFactories[number][] {
    return [...this.#factories.values()] as readonly TFactories[number][];
  }

  has(kind: string): boolean {
    return this.#factories.has(kind);
  }

  get<TKind extends TFactories[number]['kind']>(kind: TKind): PluginByKind<PluginFactoryCollection<TFactories>, TKind> | undefined {
    const factory = this.#factories.get(kind);
    return factory as PluginByKind<PluginFactoryCollection<TFactories>, TKind> | undefined;
  }

  allKinds(): readonly TFactories[number]['kind'][] {
    return [...this.#factories.keys()] as readonly TFactories[number]['kind'][];
  }

  byStage<TKind extends string>(stageLabel: StageLabel<TKind>) {
    return [...(this.#index.get(stageLabel as StageName) ?? [])] as readonly TFactories[number][];
  }

  mapByStage(): Prettify<Record<string, number>> {
    const summary: Record<string, number> = {};
    for (const [kind, factories] of this.#index) {
      summary[kind] = factories.length;
    }
    return summary;
  }

  timelineToSummary<TWindow extends readonly HorizonEvent[]>(
    window: TWindow,
  ): TimelineSummary<TWindow> {
    if (!window.length) {
      throw new Error('timeline missing entries');
    }

    const [head, ...rest] = window;
    const tenant = head.tenant;

    return {
      tenant,
      runId: window[window.length - 1].runId,
      total: window.length,
      events: window,
    } satisfies TimelineSummary<TWindow>;
  }
}

export const createRegistry = <const TFactories extends readonly PluginFactory<any, any, any>[]>(
  factories: TFactories,
): HorizonPluginRegistry<TFactories> => {
  const registry = new HorizonPluginRegistry<TFactories>(factories, () => void 0);
  registry.bootstrap();
  return registry;
};

export const toRuntime = <
  const TFactory extends PluginFactory<string, JsonValue, JsonValue>,
>(
  factory: TFactory,
  context: PluginContext<RuntimeInput<TFactory>>,
): PluginRuntime<RuntimeInput<TFactory>, RuntimeOutput<TFactory>> => ({
  pluginKind: factory.kind,
  stageLabel: factory.stageLabel,
  execute: async (input, runtimeContext) => {
    const machine = factory.create(runtimeContext.payload as RuntimeInput<TFactory>);
    machine.initialize(runtimeContext as PluginContext<RuntimeInput<TFactory>>);
    const outputs = await Promise.all(
      input.map(async (entry) => {
        const candidate = await machine.next(entry as RuntimeInput<TFactory>);
        return candidate as RuntimeOutput<TFactory>;
      }),
    );

    return outputs as readonly RuntimeOutput<TFactory>[];
  },
});

export const mergeRegistries = <
  Left extends readonly PluginFactory<any, any, any>[],
  Right extends readonly PluginFactory<any, any, any>[],
>(
  left: HorizonPluginRegistry<Left>,
  right: HorizonPluginRegistry<Right>,
) => {
  type TMergedFactories = MergeFactoryTuples<Left, Right>;
  const mergedEntries = [...left.allEntries(), ...right.allEntries()] as unknown as TMergedFactories;
  const merged = new HorizonPluginRegistry<TMergedFactories>(mergedEntries);
  merged.bootstrap();
  return merged as HorizonPluginRegistry<TMergedFactories>;
};

export const foldRegistry = <TFactories extends readonly PluginFactory<any, any, any>[]>(
  registry: HorizonPluginRegistry<TFactories>,
) =>
  registry
    .allEntries()
    .reduce<{
      readonly stages: readonly string[];
      readonly ordered: readonly string[];
    }>(
      (acc, entry) =>
        ({
          ...acc,
          stages: [...acc.stages, entry.kind],
          ordered: [...acc.ordered, `${entry.kind}:${entry.label}`],
        }) as const,
      {
        stages: [],
        ordered: [],
      } as const,
    );

export type PluginPath<T extends Record<string, unknown>> = {
  readonly path: keyof T & string;
  readonly value: T[keyof T];
};
