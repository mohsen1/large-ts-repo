import type {
  PluginContract,
  PluginConfig,
  PluginPayload,
  PluginHandle,
  PluginStage,
  HorizonSignal,
  RunId,
  TimeMs,
  ValidationIssue,
  JsonLike,
} from './types.js';
import { horizonBrand } from './types.js';

export type PluginCtorInput = {
  readonly enabled?: boolean;
  readonly weight?: number;
};

export type PluginOptions<TKind extends PluginStage, TPayload> = {
  readonly pluginKind: TKind;
  readonly config: PluginConfig<TKind, TPayload>;
  readonly schema?: Record<string, unknown>;
  readonly enabled?: boolean;
  readonly weight?: number;
};

export interface PluginFactory<TKind extends PluginStage, TPayload, TState> {
  readonly key: TKind;
  readonly label: string;
  readonly schema?: Record<string, unknown>;
  make(config: PluginConfig<TKind, TPayload>): PluginStateMachine<TPayload, TState>;
  validate(payload: unknown): payload is TPayload;
}

export interface PluginStateMachine<TIn, TOut> {
  readonly initialize: (input: TIn) => TOut;
  readonly step: (state: TOut, signal: AbortSignal) => Promise<TOut>;
  readonly dispose: () => void;
}

export type PluginFactoryMap<T extends readonly PluginFactory<any, any, any>[]> = {
  [K in T[number] as K['key']]: K;
};

export type PluginRuntime<TKind extends PluginStage, TPayload> = PluginContract<TKind, PluginConfig<TKind, TPayload>, TPayload> &
  PluginCtorInput & {
    readonly execute: PluginHandle<TKind, TPayload>;
  };

export type PluginList<T extends readonly PluginRuntime<any, any>[]> = {
  readonly order: T;
  readonly unique: T extends readonly [infer A, ...infer B]
    ? A & (B[number] extends never ? unknown : PluginRuntime<any, any>)
    : never;
};

export type PluginLoadResult = {
  readonly loaded: number;
  readonly skipped: readonly string[];
  readonly skippedReasons: Record<string, ValidationIssue[]>;
};

export class HorizonPluginRegistry<TStages extends readonly PluginStage[] = PluginStage[]> {
  #entries = new Map<string, PluginRuntime<any, any>>();

  constructor(
    public readonly stages: TStages,
  ) {}

  register<TKind extends PluginStage, TPayload>(runtime: PluginRuntime<TKind, TPayload>) {
    const key = `${runtime.id}`;
    this.#entries.set(key, runtime);
    return this as HorizonPluginRegistry<TStages>;
  }

  has(id: string) {
    return this.#entries.has(id);
  }

  plugin<TKind extends PluginStage, TPayload>(id: string): PluginRuntime<TKind, TPayload> {
    const runtime = this.#entries.get(id);
    if (!runtime) {
      throw new Error(`plugin not found: ${id}`);
    }
    return runtime as PluginRuntime<TKind, TPayload>;
  }

  listByStage<T extends PluginStage>(stage: T): PluginRuntime<T, any>[] {
    return [...this.#entries.values()].filter((entry) => entry.kind === stage) as PluginRuntime<T, any>[];
  }

  clear() {
    this.#entries.clear();
  }
}

export const createPluginRegistry = <const TStages extends readonly PluginStage[]>(
  stages: TStages,
) => {
  return new HorizonPluginRegistry(stages);
};

export const isPayloadValid = <TPayload>(
  predicate: (value: unknown) => value is TPayload,
  payload: unknown,
): payload is TPayload => {
  return predicate(payload);
};

const toRunId = (value: string): RunId => horizonBrand.fromRunId(value);
const now = () => Date.now() as TimeMs;

export const registerAll = <
  T extends readonly PluginFactory<any, any, any>[],
  C extends readonly PluginOptions<any, any>[],
>(
  registry: HorizonPluginRegistry,
  factories: T,
  options: C,
): PluginLoadResult => {
  const skippedReasons: Record<string, ValidationIssue[]> = {};
  let loaded = 0;
  const skipped: string[] = [];

  for (const [index, factory] of factories.entries()) {
    const candidate = options.find((entry) => entry.pluginKind === factory.key);
    if (!candidate) {
      skipped.push(factory.key);
      skippedReasons[factory.key] = [
        {
          path: ['options'],
          severity: 'warn',
          message: `plugin configuration missing for ${factory.key}`,
        },
      ];
      continue;
    }

    if (!factory.validate(candidate.config.payload)) {
      skipped.push(factory.key);
      skippedReasons[factory.key] = [
        {
          path: ['payload'],
          severity: 'error',
          message: `invalid payload for ${factory.key}`,
        },
      ];
      continue;
    }

    const stateMachine = (
      factory as PluginFactory<PluginStage, PluginPayload, PluginPayload>
    ).make(candidate.config as PluginConfig<PluginStage, PluginPayload>);
    const runtimeId = `${factory.key}-${index}` as const;

    const execute: PluginHandle<any, PluginPayload> = async (input, signal) => {
      const output: HorizonSignal<any, PluginPayload>[] = [];
      for (const [order, entry] of input.entries()) {
        const seeded = stateMachine.initialize(entry.payload as PluginPayload);
        const stepped = await stateMachine.step(seeded as PluginPayload, signal);
        output.push({
          id: horizonBrand.fromPlanId(`plan-${runtimeId}-${order}`),
          kind: entry.pluginKind,
          payload: stepped as JsonLike,
          input: {
            version: '1.0.0',
            runId: toRunId(`registry-${runtimeId}-${order}-${now()}`),
            tenantId: 'tenant-001',
            stage: entry.pluginKind,
            tags: ['registry', factory.key],
            metadata: { source: factory.key, runtime: runtimeId },
          },
          severity: 'low',
          startedAt: horizonBrand.fromDate(new Date().toISOString()),
        });
      }
      return output;
    };

    const runtime: PluginRuntime<any, PluginPayload> = {
      id: `${runtimeId}` as unknown as PluginRuntime<any, PluginPayload>['id'],
      kind: factory.key,
      capabilities: [
        {
          key: factory.key,
          description: factory.label,
          configSchema: candidate.schema ?? {},
        },
      ],
      defaults: candidate.config as PluginConfig<PluginStage, PluginPayload>,
      execute,
      enabled: candidate.enabled,
      weight: candidate.weight,
    };

    registry.register(runtime);
    loaded += 1;
  }

  return {
    loaded,
    skipped: skipped as readonly string[],
    skippedReasons,
  };
};
