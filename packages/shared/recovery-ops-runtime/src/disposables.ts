export interface DisposableHandle {
  readonly name: string;
  readonly released: boolean;
  [Symbol.dispose](): void;
}

export interface AsyncDisposableHandle {
  readonly name: string;
  readonly released: boolean;
  [Symbol.asyncDispose](): Promise<void>;
}

export const makeDisposable = (name: string, onDispose: () => void): DisposableHandle => ({
  name,
  released: false,
  [Symbol.dispose](): void {
    onDispose();
    (this as { released: boolean }).released = true;
  },
});

export const makeAsyncDisposable = (name: string, onDispose: () => Promise<void>): AsyncDisposableHandle => ({
  name,
  released: false,
  async [Symbol.asyncDispose](): Promise<void> {
    await onDispose();
    (this as { released: boolean }).released = true;
  },
});

export class ScopedRegistry implements AsyncDisposable {
  #handles: AsyncDisposableHandle[] = [];

  constructor(public readonly label: string) {}

  track(handle: AsyncDisposableHandle): void {
    this.#handles.push(handle);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    while (this.#handles.length) {
      const handle = this.#handles.pop();
      if (handle) {
        await handle[Symbol.asyncDispose]();
      }
    }
  }
}

export const withAsyncScope = async <T>(
  label: string,
  block: (stack: AsyncDisposableStack) => Promise<T>,
): Promise<T> => {
  await using scope = new ScopedRegistry(label);
  const stack = new AsyncDisposableStack();
  stack.defer(() => scope[Symbol.asyncDispose]());
  return await block(stack);
};

export const withDisposable = <T>(
  name: string,
  resource: { [Symbol.dispose](): void },
  block: () => T,
): T => {
  using _ = resource;
  return block();
};

export class ScopedMetric implements Disposable {
  startedAt = Date.now();
  #closed = false;

  constructor(public readonly name: string) {}

  close(): void {
    this.#closed = true;
  }

  get closed(): boolean {
    return this.#closed;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export class AsyncScopedMetric implements AsyncDisposable {
  startedAt = Date.now();
  #closed = false;

  constructor(public readonly name: string) {}

  async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve();
    this.#closed = true;
  }

  get closed(): boolean {
    return this.#closed;
  }
}
