import { fail, ok, type Result } from '@shared/result';
import { NoInfer } from '@shared/type-level';
import {
  type ChaosRunId,
  type ChaosRunPhase,
  type ChaosScope,
  type ChaosSignalEnvelope,
  type ChaosWorkspaceId,
  type EpochMs,
  type RunEntropy,
  toEntropy,
  toHealthScore,
  type HealthScore,
  type MetricPoint,
} from './types';

type AsyncStackLike = {
  use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void;
  [Symbol.asyncDispose](): PromiseLike<void>;
  [Symbol.dispose](): void;
};

function resolveAsyncStack(): { new (): AsyncStackLike } {
  const AsyncDisposableStackCtor = (globalThis as unknown as { readonly AsyncDisposableStack?: { new (): AsyncStackLike } }).AsyncDisposableStack;
  if (AsyncDisposableStackCtor) {
    return AsyncDisposableStackCtor;
  }

class FallbackAsyncDisposableStack implements AsyncStackLike {
    #resources: Array<{ [Symbol.asyncDispose]?: () => PromiseLike<void> }> = [];

    use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void {
      this.#resources.push(value);
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (const resource of [...this.#resources].reverse()) {
        await resource[Symbol.asyncDispose]?.();
      }
      this.#resources = [];
    }

    [Symbol.dispose](): void {
      void this[Symbol.asyncDispose]();
    }
  }

  return FallbackAsyncDisposableStack;
}

interface RuntimeDisposable {
  [Symbol.asyncDispose](): PromiseLike<void>;
  [Symbol.dispose](): void;
}

export interface RuntimeSignal<T = unknown> {
  readonly runId: ChaosRunId;
  readonly at: EpochMs;
  readonly phase: ChaosRunPhase;
  readonly event: ChaosSignalEnvelope<T>;
}

export type SignalSequence<T> = AsyncIterable<RuntimeSignal<T>>;

export interface RuntimeEnvelope<T = unknown> {
  readonly runId: ChaosRunId;
  readonly workspace: ChaosWorkspaceId;
  readonly phase: ChaosRunPhase;
  readonly startedAt: EpochMs;
  readonly signals: readonly RuntimeSignal<T>[];
  readonly score: HealthScore;
}

function createLease(id: string): RuntimeDisposable {
  return {
    async [Symbol.asyncDispose]() {
      void id;
    },
    [Symbol.dispose]() {
      void id;
    }
  };
}

async function* toIterator<T>(input: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T> {
  if (Symbol.asyncIterator in Object(input)) {
    for await (const item of input as AsyncIterable<T>) {
      yield item;
    }
    return;
  }

  for (const item of input as Iterable<T>) {
    yield item;
  }
}

export async function streamSignals<T>(
  signals: Iterable<RuntimeSignal<T>> | AsyncIterable<RuntimeSignal<T>>,
  phase: ChaosRunPhase,
  runId: ChaosRunId
): Promise<RuntimeSignal<T>[]> {
  const collected: RuntimeSignal<T>[] = [];
  for await (const event of toIterator(signals)) {
    collected.push({
      ...event,
      runId: event.runId ?? runId,
      phase: event.phase ?? phase,
      at: event.at ?? (Date.now() as EpochMs)
    });
  }
  return collected;
}

export class RuntimeScope {
  readonly #scope: string;
  readonly #signals: RuntimeSignal[] = [];
  readonly #createdAt: EpochMs;
  readonly #stack: AsyncStackLike;

  constructor(scope: string) {
    this.#scope = scope;
    this.#createdAt = Date.now() as EpochMs;
    const AsyncStack = resolveAsyncStack();
    this.#stack = new AsyncStack();
  }

  emit<T>(signal: RuntimeSignal<T>): void {
    this.#signals.push(signal);
  }

  entries<T = unknown>(): readonly RuntimeSignal<T>[] {
    return this.#signals.map((signal) => ({
      runId: signal.runId,
      at: signal.at,
      phase: `phase:${this.#scope}` as ChaosRunPhase,
      event: signal.event as unknown as ChaosSignalEnvelope<T>
    }));
  }

  metrics(): readonly MetricPoint[] {
    return this.#signals.map((signal) => ({
      name: `${this.#scope}::signal`,
      samples: [{ metric: `${this.#scope}::signal`, value: 1, at: signal.at }],
      score: toHealthScore(
        typeof signal.event.payload === 'number'
          ? signal.event.payload
          : this.#signals.length
      )
    }));
  }

  ageMs(): number {
    return Date.now() - this.#createdAt;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }
}

export function createRuntimeScope(scope: string): RuntimeScope {
  return new RuntimeScope(scope);
}

export async function withRuntimeScope<T>(
  scope: string,
  run: (ctx: RuntimeScope) => Promise<T>
): Promise<T> {
  const AsyncScopeStack = resolveAsyncStack();
  using stack = new AsyncScopeStack();
  using _lease = createLease(scope);

  const ctx = createRuntimeScope(scope);
  stack.use(ctx);

  return run(ctx);
}

export interface PhaseAccumulator {
  readonly scope: ChaosScope;
  readonly phase: ChaosRunPhase;
  readonly startedAt: EpochMs;
  readonly signals: readonly RuntimeSignal[];
}

export type TelemetryTuple<T extends readonly ChaosScope[]> = {
  [I in keyof T]: [T[I], PhaseAccumulator];
};

export function initTelemetry<TPhases extends readonly ChaosScope[]>(
  phases: NoInfer<TPhases>,
  runId: ChaosRunId
): TelemetryTuple<TPhases> {
  const tuples: TelemetryTuple<TPhases> = phases.map((phase, index) => [
    phase,
    {
      scope: phase,
      phase: `phase:${phase}` as ChaosRunPhase,
      startedAt: Date.now() as EpochMs,
      signals: [{
        runId,
        at: (Date.now() + index) as EpochMs,
        phase: `phase:${phase}` as ChaosRunPhase,
        event: {
          id: `${runId}:phase:${phase}` as never,
          kind: `phase:${phase}::event` as never,
          tenant: 'tenant:telemetry',
          createdAt: new Date().toISOString() as never,
          at: Date.now() as EpochMs,
          payload: {}
        }
      }]
    }
  ]) as TelemetryTuple<TPhases>;

  return tuples;
}

export function appendSignal<T>(
  store: readonly RuntimeSignal<T>[],
  signal: Omit<RuntimeSignal<T>, 'at'>,
): readonly RuntimeSignal<T>[] {
  return [...store, { ...signal, at: Date.now() as EpochMs }];
}

export async function summarizeRun<T>(
  scope: string,
  signals: readonly RuntimeSignal<T>[]
): Promise<Result<RuntimeEnvelope<T>>> {
  const score = toHealthScore(Math.max(0, signals.length * 10));
  const output: RuntimeEnvelope<T> = {
    runId: signals[0]?.runId ?? (`run:${scope}:${Date.now()}` as ChaosRunId),
    workspace: `workspace:${scope}` as ChaosWorkspaceId,
    phase: `phase:${scope}` as ChaosRunPhase,
    startedAt: signals[0]?.at ?? (Date.now() as EpochMs),
    signals,
    score
  };

  return ok(output);
}

export function normalizeRunId(input: string): ChaosRunId {
  return `run:${input}` as ChaosRunId;
}

export async function runWithSignals<T>(
  scope: string,
  events: readonly RuntimeSignal<T>[]
): Promise<Result<RuntimeEnvelope<T>>> {
  return withRuntimeScope(scope, async () => summarizeRun(scope, events));
}

export function computeEntropy<T>(values: readonly T[], selector: (value: T) => number): RunEntropy {
  const entropy = values.reduce((value, current) => value + selector(current), 0) / (values.length || 1);
  return toEntropy(entropy);
}

export function metricIterator<T>(metrics: readonly MetricPoint[]): IterableIterator<MetricPoint> {
  function* iterate(): IterableIterator<MetricPoint> {
    for (const metric of metrics) {
      yield metric;
    }
  }
  return iterate();
}

export function metricAverages(metrics: readonly MetricPoint[]): readonly { readonly metric: string; readonly avg: number }[] {
  const grouped = new Map<string, number[]>();
  for (const metric of metrics) {
    const current = grouped.get(metric.name) ?? [];
    current.push(metric.score as unknown as number);
    grouped.set(metric.name, current);
  }
  return [...grouped.entries()].map(([metric, samples]) => ({
    metric,
    avg: samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length)
  }));
}

export function* flattenSignals<T>(
  signals: readonly RuntimeSignal<T>[]
): Generator<T, void, void> {
  for (const signal of signals) {
    yield signal.event.payload as T;
  }
}

export function collect<T>(
  iterator: Iterable<T> | AsyncIterable<T>
): Promise<readonly T[]> {
  return toArray(iterator);
}

async function toArray<T>(iterator: Iterable<T> | AsyncIterable<T>): Promise<readonly T[]> {
  const all: T[] = [];
  for await (const item of toIterator(iterator)) {
    all.push(item);
  }
  return all;
}
