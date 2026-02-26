import type { DeepReadonly } from '@shared/type-level';
import { createTrace, toRuntimeTrace } from './scope.js';
import type {
  HorizonRunId,
  StageName,
  StageLabel,
  PluginLabel,
  HorizonEnvelope,
  HorizonTag,
  HorizonEpoch,
} from './runtime-types.js';
import type { TraceFrame as TracedFrame } from './scope.js';
import type { HorizonTraceContext } from './scope.js';

export interface RuntimeContext {
  readonly trace: HorizonTraceContext;
  readonly labels: readonly string[];
  readonly startedAt: HorizonEpoch;
}

export interface RuntimeInput<TPayload = unknown> {
  readonly tenant: string;
  readonly runId: HorizonRunId;
  readonly stage: StageName;
  readonly payload: TPayload;
}

export interface RuntimeOutput<TPayload = unknown> extends RuntimeInput<TPayload> {
  readonly emittedAt: HorizonEpoch;
  readonly trace: readonly HorizonEnvelope[];
}

export interface RuntimeAdapter<
  TInput extends RuntimeInput = RuntimeInput,
  TOutput extends RuntimeInput = RuntimeInput,
> {
  readonly kind: TInput['stage'];
  readonly describe: (input: TInput) => string;
  run(input: TInput, context: RuntimeContext, signal: AbortSignal): Promise<readonly TOutput[]>;
}

export interface RuntimeEvent {
  readonly stage: StageName;
  readonly kind: StageLabel<StageName>;
  readonly startedAt: HorizonEpoch;
  readonly elapsedMs: number;
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly pluginLabel: PluginLabel<string>;
}

export interface RuntimeSnapshot<TAdapters extends readonly RuntimeAdapter[]> {
  readonly adapters: TAdapters;
  readonly labels: readonly string[];
  readonly history: readonly RuntimeEvent[];
  readonly state: {
    readonly stageCount: number;
    readonly startedAt: HorizonEpoch;
    readonly completedAt?: HorizonEpoch;
  };
}

export type ChainInput<TAdapters extends readonly RuntimeAdapter[]> = TAdapters extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Head extends RuntimeAdapter<infer Input, infer Output>
    ? Rest extends readonly RuntimeAdapter[]
      ? [Input, ...ChainInput<Rest extends readonly RuntimeAdapter[] ? Rest : never>]
      : [Input]
    : [RuntimeInput]
  : [RuntimeInput];

export type ChainOutput<TAdapters extends readonly RuntimeAdapter[]> = readonly RuntimeOutput[];

export const toStageLabel = <T extends string>(stage: T): StageLabel<T> => {
  return `${String(stage).toUpperCase()}_STAGE` as StageLabel<T>;
};

export const asAdapterLabel = <T extends StageName>(stage: T): PluginLabel<T> => {
  return `${stage.toLowerCase()}.${stage.toUpperCase()}` as PluginLabel<T>;
};

export const describeAdapters = <TAdapters extends readonly RuntimeAdapter[]>(
  adapters: TAdapters,
): readonly string[] =>
  adapters.map((adapter) =>
    adapter.describe({
      tenant: 'tenant',
      runId: `tenant:runtime:${Date.now()}` as HorizonRunId,
      stage: adapter.kind,
      payload: { stage: adapter.kind },
    } as RuntimeInput),
  );

export const normalizeLabels = <T extends readonly string[]>(
  labels: T,
): readonly { readonly label: T[number] }[] =>
  labels.map((label) => ({ label })) as readonly { readonly label: T[number] }[];

export const tupleFromRecord = <const T extends Record<string, unknown>>(value: T): readonly [string, unknown][] => {
  return Object.entries(value) as readonly [string, unknown][];
};

export const expandLabelSet = <T extends readonly StageName[]>(
  labels: T,
): Record<string, `${Lowercase<string>}.${Uppercase<string>}`> => {
  const out = {} as Record<string, `${Lowercase<string>}.${Uppercase<string>}`>;
  for (const stage of labels) {
    out[stage] = `${stage.toLowerCase()}.${stage.toUpperCase()}` as `${Lowercase<string>}.${Uppercase<string>}`;
  }
  return out;
};

export type FlattenAdapters<TAdapters extends readonly RuntimeAdapter[]> =
  TAdapters[number] extends RuntimeAdapter<infer Input, infer Output>
    ? readonly [Input, Output]
    : readonly [RuntimeInput, RuntimeOutput];

type AsyncStackLike = {
  use<T>(value: T): T;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

type AsyncStackCtor = new () => AsyncStackLike;

type RuntimeTraceFrame = TracedFrame;

class RuntimeEnvelopeCollector {
  readonly #rows: RuntimeEvent[] = [];

  add(event: RuntimeEvent): void {
    this.#rows.push(event);
  }

  clear(): void {
    this.#rows.length = 0;
  }

  snapshot(): readonly RuntimeEvent[] {
    return [...this.#rows];
  }

  [Symbol.dispose](): void {
    this.clear();
  }
}

class RuntimeRegistry<T extends readonly RuntimeAdapter[]> {
  readonly #adapters: T;

  constructor(adapters: T) {
    this.#adapters = adapters;
  }

  get adapters(): T {
    return this.#adapters;
  }

  get labels(): readonly string[] {
    return this.#adapters.map((entry) => String(entry.kind));
  }
}

export class PipelineExecutor<TAdapters extends readonly RuntimeAdapter[]> {
  readonly #adapters: TAdapters;
  readonly #tenant: string;
  readonly #runId: HorizonRunId;
  readonly #trace: HorizonTraceContext;
  readonly #labels: readonly string[];
  readonly #collector = new RuntimeEnvelopeCollector();
  readonly #startedAt: HorizonEpoch;
  #completedAt?: HorizonEpoch;
  readonly #registry: RuntimeRegistry<TAdapters>;

  constructor(tenant: string, runId: HorizonRunId, adapters: TAdapters) {
    this.#adapters = adapters;
    this.#tenant = tenant;
    this.#runId = runId;
    this.#labels = adapters.map((adapter) => String(adapter.kind));
    this.#registry = new RuntimeRegistry(adapters);
    this.#startedAt = Date.now() as HorizonEpoch;
    this.#trace = createTrace({
      tenantId: tenant,
      runId,
      traceId: `trace:${tenant}:${runId}`,
      sessionId: `session:${tenant}:${Date.now()}`,
    });
  }

  get snapshot(): RuntimeSnapshot<TAdapters> {
    return {
      adapters: this.#registry.adapters,
      labels: this.#labels,
      history: this.#collector.snapshot(),
      state: {
        stageCount: this.#adapters.length,
        startedAt: this.#startedAt,
        completedAt: this.#completedAt,
      },
    };
  }

  async execute(input: RuntimeInput, options?: { readonly signal?: AbortSignal }): Promise<ChainOutput<TAdapters>> {
    const signal = options?.signal ?? new AbortController().signal;
    const context = {
      trace: this.#trace,
      labels: this.#labels,
      startedAt: this.#startedAt,
    } satisfies RuntimeContext;

    let current: readonly RuntimeInput[] = [
      {
        tenant: this.#tenant,
        runId: this.#runId,
        stage: input.stage,
        payload: input.payload,
      },
    ];

    for (const adapter of this.#adapters) {
      const startedAt = Date.now() as HorizonEpoch;
      const next: RuntimeOutput[] = [];

      try {
        for (const item of current) {
          const outputs = await adapter.run(item as never, context, signal);
          for (const output of outputs) {
            next.push({
              ...output,
              emittedAt: Date.now() as HorizonEpoch,
              trace: toRuntimeTrace(this.#trace, [], []).events,
            });
          }
        }

        current = next;
        this.#collector.add({
          stage: adapter.kind,
          kind: toStageLabel(adapter.kind),
          startedAt,
          elapsedMs: Number(Date.now() - startedAt),
          ok: true,
          errors: [],
          pluginLabel: asAdapterLabel(adapter.kind),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.#collector.add({
          stage: adapter.kind,
          kind: toStageLabel(adapter.kind),
          startedAt,
          elapsedMs: Number(Date.now() - startedAt),
          ok: false,
          errors: [message],
          pluginLabel: asAdapterLabel(adapter.kind),
        });
        throw error;
      }
    }

    this.#completedAt = Date.now() as HorizonEpoch;
    return current as ChainOutput<TAdapters>;
  }

  [Symbol.dispose](): void {
    this.#collector[Symbol.dispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const frames = this.#collector.snapshot().map((event): RuntimeTraceFrame => ({
      sessionId: this.#trace.sessionId,
      tenant: this.#trace.tenant,
      runId: this.#trace.runId,
      traceId: this.#trace.traceId,
      startedAt: event.startedAt,
      event: `${event.stage}:${event.kind}`,
      metadata: {
        kind: event.kind,
        ok: event.ok,
      },
      severity: event.ok ? 'info' : 'critical',
      eventKind: event.ok ? 'control' : 'diagnostic',
      tags: [] as readonly HorizonTag[],
      version: 'v1.0',
      stage: event.stage,
    }));
    toRuntimeTrace(this.#trace, frames, []);
  }
}

export interface PipelineFactory<TAdapters extends readonly RuntimeAdapter[]> {
  readonly id: string;
  readonly tenant: string;
  readonly adapters: TAdapters;
  build(): PipelineExecutor<TAdapters>;
}

export const composePipeline = <
  const TAdapters extends readonly RuntimeAdapter[],
>(
  id: string,
  tenant: string,
  adapters: TAdapters,
): PipelineFactory<TAdapters> => ({
  id,
  tenant,
  adapters,
  build: () => new PipelineExecutor<TAdapters>(tenant, `run:${id}:${Date.now()}` as HorizonRunId, adapters),
});

export const summarizeRuntime = <TAdapters extends readonly RuntimeAdapter[]>(
  snapshots: readonly RuntimeSnapshot<TAdapters>[],
): readonly { readonly label: string; readonly value: number }[] => {
  return snapshots.reduce<readonly { readonly label: string; readonly value: number }[]>((acc, snapshot) => {
    const label = snapshot.adapters.map((adapter) => adapter.kind).join('->') || 'empty';
    return [...acc, { label, value: snapshot.history.length }];
  }, []);
};

export const mapByAdapterKind = <TAdapters extends readonly RuntimeAdapter[]>(
  snapshots: readonly RuntimeSnapshot<TAdapters>[],
): Readonly<Record<string, number>> => {
  const output = new Map<string, number>();
  for (const snapshot of snapshots) {
    for (const history of snapshot.history) {
      output.set(history.stage, (output.get(history.stage) ?? 0) + 1);
    }
  }
  return Object.fromEntries(output) as Readonly<Record<string, number>>;
};

export const asReadonly = <T>(value: T): DeepReadonly<T> => {
  return value as DeepReadonly<T>;
};

export const adaptStages = async <
  const TAdapters extends readonly RuntimeAdapter[],
  const TInput extends RuntimeInput,
>(
  options: {
    readonly tenant: string;
    readonly runId: HorizonRunId;
    readonly adapters: TAdapters;
    readonly input: TInput;
    readonly signal?: AbortSignal;
    readonly onEvent?: (event: RuntimeEvent) => void;
  },
): Promise<
  | {
      readonly ok: true;
      readonly outputs: ChainOutput<TAdapters>;
      readonly trace: readonly RuntimeEvent[];
    }
  | {
      readonly ok: false;
      readonly error: Error;
      readonly trace: readonly RuntimeEvent[];
    }
> => {
  const stackCtor = (
    globalThis as unknown as { AsyncDisposableStack?: AsyncStackCtor }
  ).AsyncDisposableStack;

  if (!stackCtor) {
    return {
      ok: false,
      error: new Error('AsyncDisposableStack unavailable'),
      trace: [],
    };
  }

  using stack = new stackCtor();
  const executor = new PipelineExecutor<TAdapters>(options.tenant, options.runId, options.adapters);
  stack.use(executor);

  try {
    const outputs = await executor.execute(options.input, { signal: options.signal });
    const trace = executor.snapshot.history;
    for (const event of trace) {
      options.onEvent?.(event);
    }
    return { ok: true, outputs, trace };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      trace: executor.snapshot.history,
    };
  }
};

export const remapToRuntimeKeys = <
  const TAdapters extends readonly RuntimeAdapter[],
>(
  snapshot: RuntimeSnapshot<TAdapters>,
  prefix: string,
): Readonly<Record<string, RuntimeEvent>> => {
  const out = Object.create(null) as Record<string, RuntimeEvent>;
  for (const [index, event] of snapshot.history.entries()) {
    out[`${prefix}-${index}-${event.stage}`] = event;
  }
  return out;
};

export const normalizeStagePath = <T extends string>(path: T): Record<`ns.${T}`, string> => {
  const key = `ns.${path}` as const;
  const out = {} as Record<`ns.${T}`, string>;
  out[key] = path;
  return out;
};
