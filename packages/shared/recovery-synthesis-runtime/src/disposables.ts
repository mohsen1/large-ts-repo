export interface SyncDisposableLike {
  [Symbol.dispose](): void;
}

export interface AsyncDisposableLike {
  [Symbol.asyncDispose](): PromiseLike<void> | void;
}

export interface AsyncDisposableStackLike extends AsyncDisposableLike, SyncDisposableLike {
  use<T>(value: T): T;
  adopt<T>(value: T, onDispose: () => void | PromiseLike<void>): T;
}

const candidateStack = (globalThis as unknown as {
  AsyncDisposableStack?: {
    new (): {
      use<T>(value: T): T;
      adopt<T>(value: T, onDispose: () => void | PromiseLike<void>): T;
      [Symbol.dispose](): void;
      [Symbol.asyncDispose](): PromiseLike<void> | void;
    };
  };
}).AsyncDisposableStack;

class FallbackAsyncDisposableStack implements AsyncDisposableStackLike {
  readonly #cleanups: Array<() => PromiseLike<void> | void> = [];

  use<T>(value: T): T {
    return this.adopt(value, () => {
      // no-op for fallback resources
      return;
    });
  }

  adopt<T>(value: T, onDispose: () => void | PromiseLike<void>): T {
    this.#cleanups.push(onDispose);
    return value;
  }

  [Symbol.dispose](): void {
    for (const cleanup of [...this.#cleanups].reverse()) {
      cleanup();
    }
    this.#cleanups.length = 0;
  }

  [Symbol.asyncDispose](): PromiseLike<void> {
    return [...this.#cleanups]
      .reverse()
      .reduce<Promise<void>>((chain, cleanup) => chain.then(() => Promise.resolve(cleanup())), Promise.resolve());
  }
}

export const createAsyncDisposableStack = (): AsyncDisposableStackLike => {
  if (typeof candidateStack === 'function') {
    return new candidateStack() as AsyncDisposableStackLike;
  }

  return new FallbackAsyncDisposableStack();
};

export class AsyncLease implements AsyncDisposableLike, SyncDisposableLike {
  #active = true;

  constructor(private readonly onDispose: () => PromiseLike<void> | void) {}

  [Symbol.dispose](): void {
    if (this.#active) {
      this.#active = false;
      this.onDispose();
    }
  }

  [Symbol.asyncDispose](): PromiseLike<void> | void {
    if (this.#active) {
      this.#active = false;
      return this.onDispose();
    }

    return Promise.resolve();
  }
}

export async function withAsyncStack<T>(
  callback: (stack: AsyncDisposableStackLike) => Promise<T>,
): Promise<T> {
  using stack = createAsyncDisposableStack();
  return await callback(stack);
}

export class ResourceTracker<T> implements AsyncDisposableLike, SyncDisposableLike {
  readonly #cleanup = new Set<() => PromiseLike<void> | void>();

  constructor(private readonly value: T) {}

  get current(): T {
    return this.value;
  }

  track(disposer: () => PromiseLike<void> | void): void {
    this.#cleanup.add(disposer);
  }

  [Symbol.dispose](): void {
    for (const cleanup of [...this.#cleanup].reverse()) {
      cleanup();
    }
    this.#cleanup.clear();
  }

  [Symbol.asyncDispose](): PromiseLike<void> {
    return [...this.#cleanup]
      .reverse()
      .reduce<Promise<void>>((chain, cleanup) => chain.then(() => Promise.resolve(cleanup())), Promise.resolve());
  }
}
