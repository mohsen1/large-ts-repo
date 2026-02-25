import { collectArray, mapAsync, type AsyncLikeIterable } from './iterator-tools';

export interface ScopedResource<T> {
  readonly id: `scope:${string}`;
  readonly value: T;
}

export type EventLevel = 'trace' | 'metric' | 'warning' | 'error';
export type EventCode = `${EventLevel}:${string}`;

export interface StreamEvent<TPayload extends object> {
  readonly id: string;
  readonly stage: EventLevel;
  readonly code: EventCode;
  readonly payload: TPayload;
  readonly at: string;
}

export interface ScopeSnapshot {
  readonly label: string;
  readonly startedAt: string;
  readonly events: readonly string[];
}

type DisposerFn = () => void;
type AsyncDisposerFn = () => PromiseLike<void>;
type DisposableLike = { [Symbol.dispose]?: DisposerFn; [Symbol.asyncDispose]?: AsyncDisposerFn };

interface ScopeStackLike {
  use<T>(value: T): void;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): PromiseLike<void>;
}

const toRouteLabel = (seed: readonly string[]): string => seed.toSorted().join('::');
const nowIso = (): string => new Date().toISOString();

type NativeAsyncDisposableStack = {
  use: (value: object, onDispose: () => void, onAsyncDispose?: () => PromiseLike<void> | void) => void;
  dispose: () => void;
  disposeAsync: () => PromiseLike<void>;
};

class FallbackAsyncDisposableStack implements ScopeStackLike {
  readonly #entries: Array<{ sync?: DisposerFn; async?: AsyncDisposerFn }> = [];

  public use<T>(value: T): void {
    const normalized = value as unknown as DisposableLike;
    const sync = normalized[Symbol.dispose];
    const async = normalized[Symbol.asyncDispose];
    this.#entries.push({ sync: sync ? sync.bind(value) : undefined, async: async ? async.bind(value) : undefined });
  }

  public [Symbol.dispose](): void {
    for (const entry of this.#entries.toReversed()) {
      entry.sync?.();
    }
    this.#entries.length = 0;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    for (const entry of this.#entries.toReversed()) {
      await (entry.async?.() ?? Promise.resolve());
    }
    this.#entries.length = 0;
  }
}

const createStack = (): ScopeStackLike => {
  if (typeof globalThis.AsyncDisposableStack === 'function') {
    const native = new (globalThis.AsyncDisposableStack as unknown as new () => NativeAsyncDisposableStack)();
    const asyncApi = native as unknown as NativeAsyncDisposableStack;

    return {
      use<T>(value: T): void {
        const disposable = value as unknown as DisposableLike;
        if (typeof disposable[Symbol.asyncDispose] === 'function') {
          asyncApi.use(value as object, () => undefined, disposable[Symbol.asyncDispose]!.bind(value));
          return;
        }
        if (typeof disposable[Symbol.dispose] === 'function') {
          asyncApi.use(value as object, disposable[Symbol.dispose]!.bind(value));
          return;
        }
        asyncApi.use(value as object, () => undefined);
      },
      [Symbol.dispose](): void {
        asyncApi.dispose();
      },
      [Symbol.asyncDispose](): PromiseLike<void> {
        return asyncApi.disposeAsync();
      },
    };
  }

  return new FallbackAsyncDisposableStack();
};

const isDisposable = (value: unknown): value is DisposableLike => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    Symbol.dispose in value ||
    Symbol.asyncDispose in value
  );
};

export class ScopedRuntime {
  readonly #label: `scope:${string}`;
  readonly #startedAt = nowIso();
  readonly #events: string[] = [];
  readonly #stack: ScopeStackLike;

  public constructor(label: string) {
    this.#label = `scope:${label}` as `scope:${string}`;
    this.#stack = createStack();
  }

  public emit(level: EventLevel, details: string): void {
    this.#events.push(`${nowIso()}::${level}::${this.#label}::${details}`);
  }

  public add<T>(resource: T): ScopedResource<T> {
    if (isDisposable(resource)) {
      this.#stack.use(resource);
      this.emit('trace', `disposable-adopted:${String(resource)}`);
    } else {
      this.emit('warning', `non-disposable:${String(resource)}`);
    }

    return {
      id: this.#label,
      value: resource,
    };
  }

  public async collectEvents(events: AsyncLikeIterable<StreamEvent<object>>): Promise<ScopeSnapshot> {
    for await (const event of events) {
      this.#events.push(`${nowIso()}::${event.code}::${event.id}`);
    }
    return this.snapshot();
  }

  public snapshot(): ScopeSnapshot {
    return {
      label: this.#label,
      startedAt: this.#startedAt,
      events: [...this.#events],
    };
  }

  public async dispose(): Promise<void> {
    await this[Symbol.asyncDispose]();
  }

  public [Symbol.dispose](): void {
    this.#stack[Symbol.dispose]();
  }

  public [Symbol.asyncDispose](): PromiseLike<void> {
    return this.#stack[Symbol.asyncDispose]().then(() => undefined);
  }
}

export const withScope = async <T>(
  label: string,
  handler: (scope: ScopedRuntime) => Promise<T>,
): Promise<T> => {
  const scope = new ScopedRuntime(label);
  await using _scope = scope;
  scope.emit('trace', `bootstrap:${label}:${toRouteLabel([label, 'active'])}`);
  try {
    return await handler(scope);
  } finally {
    scope.emit('trace', `teardown:${label}`);
  }
};

export const toEventStream = async function* <TPayload extends object>(
  labels: readonly string[],
  source: AsyncLikeIterable<TPayload>,
): AsyncGenerator<StreamEvent<TPayload>, void, void> {
  const normalized = labels.length > 0 ? labels : ['trace'];
  let index = 0;
  for await (const payload of source) {
    const stage = index % 3 === 0 ? 'trace' : index % 3 === 1 ? 'metric' : 'warning';
    yield {
      id: `event:${index}`,
      stage,
      code: `${stage}:segment:${index}` as EventCode,
      payload,
      at: nowIso(),
    };
    index += 1;
    if (index % Math.max(1, normalized.length) === 0) {
      await Promise.resolve();
    }
  }
};

export const mapEvents = async <
  TInput extends object,
  TOutput extends object,
  TCode extends EventCode,
>(
  labels: readonly string[],
  source: AsyncLikeIterable<TInput>,
  transform: (payload: TInput, code: TCode) => TOutput,
): Promise<readonly StreamEvent<TOutput>[]> => {
  const mapped = mapAsync(toEventStream(labels, source), (entry) => ({
    ...entry,
    payload: transform(entry.payload, entry.code as TCode),
  }));

  return collectArray(mapped);
};

export const runDisposableWork = async (
  label: string,
  payloads: readonly ScopedResource<string>[],
): Promise<ScopeSnapshot> => {
  return withScope(label, async (scope) => {
    for (const payload of payloads) {
      scope.add(payload.value);
      scope.emit('metric', `payload:${payload.id}:${payload.value.length}`);
    }

    return scope.snapshot();
  });
};

export const summarizePayloads = (payloads: readonly StreamEvent<object>[]) => {
  const values = payloads
    .map((entry) => `${entry.id}:${entry.code}`)
    .toSorted()
    .filter(Boolean);

  return values;
};

export const mapScopeEvents = <TPayload extends object, TOutput extends object>(
  scope: ScopedRuntime,
  labels: readonly string[],
  payloads: readonly TPayload[],
): Promise<readonly StreamEvent<{ readonly payload: TPayload; readonly scope: string; readonly timestamp: string }>[]> => {
  scope.emit('trace', `mapScopeEvents:${scope.snapshot().label}`);
  return mapEvents(
    labels,
    payloads,
    (entry) => ({
      payload: entry,
      scope: scope.snapshot().label,
      timestamp: nowIso(),
    }),
  );
};
