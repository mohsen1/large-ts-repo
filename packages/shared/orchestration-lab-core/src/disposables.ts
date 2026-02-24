type AsyncDisposableStackLike = {
  use<T>(resource: T): T;
  defer(callback: () => void | Promise<void>): void;
  disposeAsync(): Promise<void>;
  [Symbol.dispose]?: () => void;
};

type AsyncStackCtor = new () => AsyncDisposableStackLike;

type HasAsyncDisposableStack = AsyncStackCtor | undefined;

const resolveAsyncDisposableStack = (): HasAsyncDisposableStack => {
  const candidate = (globalThis as { AsyncDisposableStack?: HasAsyncDisposableStack }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }
  return undefined;
};

class FallbackAsyncDisposableStack implements AsyncDisposableStackLike {
  #callbacks: Array<() => void | Promise<void>> = [];

  public use<T>(resource: T): T {
    void resource;
    return resource;
  }

  public defer(callback: () => void | Promise<void>): void {
    this.#callbacks.push(callback);
  }

  public async disposeAsync(): Promise<void> {
    for (const callback of this.#callbacks.reverse()) {
      await callback();
    }
    this.#callbacks = [];
  }
}

type AsyncStack = AsyncDisposableStackLike;

const makeAsyncDisposableStack = (): AsyncStack => {
  const ctor = resolveAsyncDisposableStack();
  if (ctor) {
    return new ctor();
  }
  return new FallbackAsyncDisposableStack();
};

export interface ScopeDisposer {
  readonly close: () => void;
  readonly closeAsync: () => Promise<void>;
}

export const withAsyncDisposableScope = async <TResult>(work: () => Promise<TResult> | TResult): Promise<TResult> => {
  const scope = makeAsyncDisposableStack();
  try {
    return await work();
  } finally {
    await scope.disposeAsync();
  }
};

export const withDisposer = <TValue>(value: TValue, dispose: (value: TValue) => void): ScopeDisposer => {
  let released = false;

  return {
    close() {
      if (released) {
        return;
      }
      released = true;
      dispose(value);
    },
    async closeAsync() {
      if (released) {
        return;
      }
      released = true;
      dispose(value);
    },
  };
};

export class LabScope implements Disposable {
  readonly #openedAt = performance.now();
  readonly #name: string;

  public constructor(name: string) {
    this.#name = name;
  }

  public get name(): string {
    return this.#name;
  }

  public get ageMs(): number {
    return performance.now() - this.#openedAt;
  }

  public [Symbol.dispose](): void {
    this.name.toLowerCase();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve(this.ageMs);
  }
}
