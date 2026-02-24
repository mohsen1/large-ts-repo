interface AsyncScopeLike {
  [Symbol.asyncDispose](): Promise<void>;
  [Symbol.dispose](): void;
  use<T>(resource: T): T;
  adopt<T>(resource: T, disposer: () => void | PromiseLike<void>): T;
}

interface NativeAsyncScopeLike {
  [Symbol.asyncDispose](): Promise<void>;
  [Symbol.dispose]?: () => void;
  use<T>(resource: T): T;
  adopt<T>(resource: T, disposer: () => void | PromiseLike<void>): T;
}

type AsyncDisposableStackCtor = new () => NativeAsyncScopeLike;

const asyncDisposableStackCtor =
  (globalThis as { AsyncDisposableStack?: AsyncDisposableStackCtor }).AsyncDisposableStack;

class FallbackScope implements AsyncScopeLike {
  readonly #stack: Array<() => Promise<void>> = [];

  use<T>(resource: T): T {
    return resource;
  }

  adopt<T>(resource: T, disposer: () => void | PromiseLike<void>): T {
    this.#stack.push(() => Promise.resolve(disposer()));
    return resource;
  }

  [Symbol.dispose](): void {
    const entries = this.#stack.splice(0);
    for (const dispose of entries.reverse()) {
      dispose();
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const entries = this.#stack.splice(0);
    for (const dispose of entries.reverse()) {
      await dispose();
    }
  }
}

export const createScope = (): AsyncScopeLike =>
  asyncDisposableStackCtor ? (new asyncDisposableStackCtor() as unknown as AsyncScopeLike) : new FallbackScope();

export const withAsyncScope = async <R>(work: (scope: AsyncScopeLike) => Promise<R>): Promise<R> => {
  const scope = createScope();
  try {
    return await work(scope);
  } finally {
    await scope[Symbol.asyncDispose]();
  }
};
