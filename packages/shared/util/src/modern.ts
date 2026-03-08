export type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
};

export type ScopeEventPhase = 'enter' | 'exit';

export type ScopeEvent = {
  readonly label: string;
  readonly phase: ScopeEventPhase;
  readonly at: number;
};

export type ScopeResult<T> = {
  readonly value: T;
  readonly timeline: readonly ScopeEvent[];
};

const scopePhases = ['enter', 'exit'] as const satisfies readonly ScopeEventPhase[];

const now = (): number => Date.now();

class SyncScope implements Disposable {
  constructor(
    private readonly label: string,
    private readonly timeline: ScopeEvent[],
  ) {
    this.timeline.push({ label, phase: scopePhases[0], at: now() });
  }

  [Symbol.dispose](): void {
    this.timeline.push({ label: this.label, phase: scopePhases[1], at: now() });
  }
}

class AsyncScope implements AsyncDisposable {
  constructor(
    private readonly label: string,
    private readonly timeline: ScopeEvent[],
  ) {
    this.timeline.push({ label, phase: scopePhases[0], at: now() });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.timeline.push({ label: this.label, phase: scopePhases[1], at: now() });
  }
}

class CleanupStack implements Disposable {
  readonly #callbacks: Array<() => void> = [];

  defer(callback: () => void): void {
    this.#callbacks.push(callback);
  }

  [Symbol.dispose](): void {
    for (const callback of this.#callbacks.toReversed()) {
      callback();
    }
  }
}

class AsyncCleanupStack implements AsyncDisposable {
  readonly #callbacks: Array<() => Promise<void> | void> = [];

  defer(callback: () => Promise<void> | void): void {
    this.#callbacks.push(callback);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const callback of this.#callbacks.toReversed()) {
      await callback();
    }
  }
}

export const createDeferred = <T>(): Deferred<T> => Promise.withResolvers<T>();

export const withScope = <T>(label: string, work: (timeline: readonly ScopeEvent[]) => T): ScopeResult<T> => {
  const timeline: ScopeEvent[] = [];
  let value!: T;
  {
    using scope = new SyncScope(label, timeline);
    value = work(timeline);
  }
  return { value, timeline };
};

export const withAsyncScope = async <T>(
  label: string,
  work: (timeline: readonly ScopeEvent[]) => Promise<T>,
): Promise<ScopeResult<T>> => {
  const timeline: ScopeEvent[] = [];
  let value!: T;
  {
    await using scope = new AsyncScope(label, timeline);
    value = await work(timeline);
  }
  return { value, timeline };
};

export const withCleanup = <T>(work: (register: (callback: () => void) => void) => T): T => {
  let value!: T;
  {
    using cleanup = new CleanupStack();
    value = work((callback) => cleanup.defer(callback));
  }
  return value;
};

export const withAsyncCleanup = async <T>(
  work: (register: (callback: () => Promise<void> | void) => void) => Promise<T>,
): Promise<T> => {
  let value!: T;
  {
    await using cleanup = new AsyncCleanupStack();
    value = await work((callback) => cleanup.defer(callback));
  }
  return value;
};
