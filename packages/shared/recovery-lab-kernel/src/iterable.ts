export interface Disposer {
  [Symbol.dispose](): void;
}

export interface AsyncDisposer extends Disposer {
  [Symbol.asyncDispose](): Promise<void>;
}

export const drainIterator = <T>(input: Iterable<T>): readonly T[] => {
  const values: T[] = [];
  for (const item of input) {
    values.push(item);
  }
  return values;
};

export const mapIterator = function* <T, U>(input: Iterable<T>, fn: (value: T) => U): IterableIterator<U> {
  for (const value of input) {
    yield fn(value);
  }
};

export const collect = <T>(input: Iterable<T>): readonly T[] => [...mapIterator(input, (value) => value)];

export const byPriority = <T extends { readonly priority: number }>(events: Iterable<T>): readonly T[] => {
  return [...events].toSorted((left, right) => right.priority - left.priority);
};

export const chunkBy = <T, K extends PropertyKey>(
  input: Iterable<T>,
  pick: (value: T) => K,
): ReadonlyMap<K, readonly T[]> => {
  const buckets = new Map<K, T[]>();
  for (const value of input) {
    const key = pick(value);
    const bucket = buckets.get(key) ?? [];
    bucket.push(value);
    buckets.set(key, bucket);
  }

  return new Map([...buckets.entries()].map(([key, values]) => [
    key,
    values.toSorted((left, right) => {
      const leftText = `${left}`;
      const rightText = `${right}`;
      return leftText.localeCompare(rightText);
    }),
  ]));
};

const createAsyncScope = (): { new (): AsyncDisposableStack } => {
  const NativeStack = (globalThis as { AsyncDisposableStack?: { new (): AsyncDisposableStack } }).AsyncDisposableStack;
  if (NativeStack) {
    return NativeStack;
  }

class FallbackAsyncDisposableStack {
    readonly #resources: Array<() => Promise<void> | void> = [];
    readonly [Symbol.toStringTag] = 'AsyncDisposableStack';
    #disposed = false;

    get disposed(): boolean {
      return this.#disposed;
    }

    use<T>(value: T): T {
      const disposable = value as { [Symbol.dispose]?: () => void };
      const asyncDisposable = value as { [Symbol.asyncDispose]?: () => Promise<void> };
      if (typeof disposable[Symbol.dispose] === 'function') {
        this.defer(() => disposable[Symbol.dispose]?.());
      }
      if (typeof asyncDisposable[Symbol.asyncDispose] === 'function') {
        this.defer(() => asyncDisposable[Symbol.asyncDispose]?.());
      }
      return value;
    }

    [Symbol.dispose](): void {
      if (this.#disposed) {
        return;
      }
      this.#disposed = true;
      for (const disposer of this.#resources.toReversed()) {
        disposer();
      }
      this.#resources.length = 0;
    }

    [Symbol.asyncDispose](): Promise<void> {
      if (this.#disposed) {
        return Promise.resolve();
      }
      this.#disposed = true;
      return Promise.all(this.#resources.toReversed().map((resource) => resource())).then(() => {
        this.#resources.length = 0;
      });
    }

    async disposeAsync(): Promise<void> {
      await this[Symbol.asyncDispose]();
    }

    adopt<T>(value: T, onDispose: (value: T) => void | Promise<void>): T {
      this.#resources.push(() => onDispose(value));
      return value;
    }

    defer(callback: () => void | Promise<void>): void {
      this.#resources.push(callback);
    }

    move(): AsyncDisposableStack {
      const moved = new FallbackAsyncDisposableStack();
      for (const resource of this.#resources) {
        moved.defer(resource);
      }
      this.#resources.length = 0;
      this.#disposed = true;
      return moved;
    }
  }

  return FallbackAsyncDisposableStack;
};

export const createDisposableScope = (): AsyncDisposableStack => new (createAsyncScope())();

export const runWithScope = async <T>(run: (scope: AsyncDisposableStack) => Promise<T>): Promise<T> => {
  await using scope = createDisposableScope();
  return await run(scope);
};
