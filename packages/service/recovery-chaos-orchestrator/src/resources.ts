import type { EventEnvelope, EntityId, EpochMs } from '@domain/recovery-chaos-lab';

export interface DisposalEvent {
  readonly id: EntityId;
  readonly kind: string;
  readonly at: EpochMs;
}

export interface AdapterHandle<TState = unknown> {
  readonly state: TState;
  readonly events: ReadonlyArray<DisposalEvent>;
}

export interface AsyncDisposableLike {
  [Symbol.asyncDispose](): PromiseLike<void> | void;
}

export interface DisposableLike {
  [Symbol.dispose](): void;
}

export class AsyncEventBuffer<T> implements AsyncDisposableLike {
  #events = new Map<string, T>();
  readonly startedAt: EpochMs;

  constructor(readonly id: EntityId) {
    this.startedAt = Date.now() as EpochMs;
  }

  push(key: string, value: T): void {
    this.#events.set(key, value);
  }

  drain(): EventEnvelope<Record<string, T>> {
    return {
      eventId: `buffer:${this.id}` as EntityId,
      occurredAt: this.startedAt,
      payloads: Object.fromEntries(this.#events.entries()) as Record<string, T>
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#events.clear();
  }
}

export class LogScope implements DisposableLike, AsyncDisposableLike {
  #opened = true;
  readonly id: string;
  readonly startedAt: EpochMs;

  constructor(id: string) {
    this.id = id;
    this.startedAt = Date.now() as EpochMs;
  }

  log(message: string): void {
    if (!this.#opened) {
      throw new Error(`scope ${this.id} is closed`);
    }
    void message;
  }

  [Symbol.dispose](): void {
    this.#opened = false;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }
}

export async function withLogScope<T>(label: string, fn: (scope: LogScope) => Promise<T>): Promise<T> {
  const eventBuffer = new AsyncEventBuffer<DisposalEvent>(`scope.${label}` as EntityId);
  const scope = new LogScope(label);
  await using _stack = new AsyncDisposableScope<AsyncEventBuffer<DisposalEvent> | LogScope>(
    eventBuffer,
    async () => {
      scope.log('disposed');
      const snapshot = eventBuffer.drain();
      void snapshot;
    }
  );
  using _scope = scope;
  return fn(scope);
}

export class AsyncDisposableScope<T extends AsyncDisposableLike & Partial<DisposableLike>> implements AsyncDisposable {
  constructor(
    readonly value: T,
    readonly cleanup: (value: T) => Promise<void>
  ) {}

  async [Symbol.asyncDispose](): Promise<void> {
    await this.cleanup(this.value);
    const sync = this.value[Symbol.dispose];
    sync?.();
  }
}

export interface RuntimePluginAdapter<TInput = unknown, TOutput = unknown> {
  readonly plugin: string;
  readonly execute: (input: TInput, context?: unknown) => Promise<TOutput>;
  readonly close: () => Promise<void>;
}

export function createPluginAdapter<
  TInput,
  TOutput,
  TDef extends StageBoundaryLike<string, TInput, TOutput>
>(
  plugin: TDef,
  fn: (input: TInput) => Promise<TOutput>
): RuntimePluginAdapter<TInput, TOutput> {
  return {
    plugin: `${plugin.name}`,
    execute: fn,
    close: async () => {
      await Promise.resolve(plugin.name);
    }
  };
}

interface StageBoundaryLike<TName extends string, TInput, TOutput> {
  readonly name: TName;
  readonly input: TInput;
  readonly output: TOutput;
}

export class StageExecutionError extends Error {
  constructor(readonly stage: string, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StageExecutionError';
  }
}
