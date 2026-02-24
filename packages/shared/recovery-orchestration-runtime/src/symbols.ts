declare global {
  interface SymbolConstructor {
    readonly dispose: unique symbol;
    readonly asyncDispose: unique symbol;
  }
}

const disposeSymbol = Symbol.dispose;
const asyncDisposeSymbol = Symbol.asyncDispose;

const isObjectLike = (value: unknown): value is Record<PropertyKey, unknown> =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

export interface DisposableLike {
  [disposeSymbol](): void;
}

export interface AsyncDisposableLike {
  [asyncDisposeSymbol](): PromiseLike<void> | void;
}

export type AsyncDisposableStackLike = {
  use<T>(resource: T): T;
  adopt<T>(resource: T, onDispose: (value: T) => PromiseLike<void> | void): T;
  disposeAsync(): Promise<void>;
  [Symbol.dispose](): void;
  [disposeSymbol](): void;
  [Symbol.asyncDispose](): PromiseLike<void> | void;
  [asyncDisposeSymbol](): PromiseLike<void> | void;
};

class FallbackAsyncDisposableStack implements AsyncDisposableStackLike {
  private readonly disposers: Array<() => PromiseLike<void> | void> = [];

  use<T>(resource: T): T {
    if (isObjectLike(resource)) {
      const disposeFn = resource[disposeSymbol];
      if (typeof disposeFn === 'function') {
        this.adopt(resource, () => {
          disposeFn.call(resource);
        });
      }

      const asyncDisposeFn = resource[asyncDisposeSymbol];
      if (typeof asyncDisposeFn === 'function') {
        this.adopt(resource, () => asyncDisposeFn.call(resource));
      }
    }

    return resource;
  }

  adopt<T>(resource: T, onDispose: (value: T) => PromiseLike<void> | void): T {
    this.disposers.push(() => onDispose(resource));
    return resource;
  }

  [disposeSymbol](): void {
    void this.disposeAsync();
  }
  [Symbol.dispose](): void {
    void this.disposeAsync();
  }

  [asyncDisposeSymbol](): PromiseLike<void> | void {
    return this.disposeAsync();
  }
  [Symbol.asyncDispose](): PromiseLike<void> | void {
    return this.disposeAsync();
  }

  async disposeAsync(): Promise<void> {
    while (this.disposers.length > 0) {
      const disposer = this.disposers.pop();
      if (disposer) {
        await disposer();
      }
    }
  }
}

export const createAsyncDisposableStack = (): AsyncDisposableStackLike => {
  return new FallbackAsyncDisposableStack();
};

export interface TraceHandle extends DisposableLike, AsyncDisposableLike {
  readonly id: string;
  readonly phase: string;
  readonly startedAt: string;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): PromiseLike<void> | void;
}

export const createTraceHandle = (id: string, phase: string): TraceHandle => {
  const startedAt = new Date().toISOString();
  const dispose = () => {
    return undefined;
  };
  const asyncDispose = async () => {
    return undefined;
  };

  return {
    id,
    phase,
    startedAt,
    [disposeSymbol]: dispose,
    [asyncDisposeSymbol]: asyncDispose,
    [Symbol.dispose]: dispose,
    [Symbol.asyncDispose]: asyncDispose,
  };
};
