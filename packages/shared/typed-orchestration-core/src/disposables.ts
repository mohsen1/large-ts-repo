export interface ScopedDisposer {
  [Symbol.dispose](): void;
}

export interface ScopedAsyncDisposer {
  [Symbol.asyncDispose](): Promise<void>;
}

export interface PluginRunScopeOptions {
  readonly namespace: string;
  readonly tags: readonly string[];
}

export class ScopeFence implements ScopedDisposer {
  #closed = false;
  #disposed = false;
  readonly createdAt = new Date().toISOString();

  public constructor(
    private readonly options: PluginRunScopeOptions,
    private readonly onDispose: (options: PluginRunScopeOptions, reason: string) => void,
  ) {}

  public [Symbol.dispose](): void {
    if (this.#closed || this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.onDispose(this.options, 'sync');
  }

  public close(reason = 'manual'): void {
    if (this.#closed || this.#disposed) {
      return;
    }
    this.#closed = true;
    this.onDispose(this.options, reason);
  }
}

export class AsyncScopeFence implements ScopedAsyncDisposer {
  #closed = false;
  #disposed = false;
  readonly createdAt = new Date().toISOString();

  public constructor(
    private readonly options: PluginRunScopeOptions,
    private readonly onDispose: (options: PluginRunScopeOptions, reason: string) => Promise<void> | void,
  ) {}

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    await this.onDispose(this.options, 'async');
  }

  public async close(reason = 'manual'): Promise<void> {
    if (this.#closed || this.#disposed) {
      return;
    }
    this.#closed = true;
    await this.onDispose(this.options, reason);
  }
}

export const useSyncScope = <T>(
  factory: () => [ScopeFence, T],
): T => {
  const [scope, value] = factory();
  using _scope = scope;
  return value;
};

export const withAsyncScope = async <T>(
  factory: () => [AsyncScopeFence, T],
  callback: (value: T) => Promise<void>,
): Promise<void> => {
  const [scope, value] = factory();
  try {
    await callback(value);
  } finally {
    await scope.close('deferred');
  }
};
