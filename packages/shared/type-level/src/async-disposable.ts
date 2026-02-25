export interface DisposableResource {
  readonly id: string;
  readonly value: unknown;
  [Symbol.dispose](): void;
}

export interface AsyncDisposableResource extends DisposableResource {
  [Symbol.asyncDispose](): Promise<void>;
}

type SyncDisposableHandle = {
  [Symbol.dispose](): void;
};

type AsyncDisposableSymbol = {
  [Symbol.asyncDispose](): PromiseLike<void>;
};

type AsyncDisposableStackLike = AsyncDisposableStack & {
  dispose(): void;
};

const hasSyncDispose = (value: unknown): value is AsyncDisposableSymbol & SyncDisposableHandle => {
  return typeof value === 'object' && value !== null && Symbol.dispose in (value as object);
};

const hasAsyncDispose = (value: unknown): value is AsyncDisposableSymbol => {
  return typeof value === 'object' && value !== null && Symbol.asyncDispose in (value as object);
};

const disposeSyncStack = (stack: AsyncDisposableStack): void => {
  (stack as unknown as AsyncDisposableStackLike).dispose();
};

const disposeAsyncStack = async (stack: AsyncDisposableStack): Promise<void> => {
  await (stack as { [Symbol.asyncDispose](): Promise<void> })[Symbol.asyncDispose]();
};

export class ScopeSession {
  readonly #resources: Array<Disposable | AsyncDisposable> = [];
  readonly #trace: string[] = [];
  #disposed = false;

  constructor(private readonly name: string) {}

  addDisposable(resource: Disposable): void {
    if (this.#disposed) {
      resource[Symbol.dispose]();
      return;
    }
    this.#resources.push(resource);
    this.#trace.push(`sync:${resource.constructor?.name ?? 'anonymous'}`);
  }

  addAsyncDisposable(resource: AsyncDisposable): void;
  addAsyncDisposable(resource: Disposable): void;
  addAsyncDisposable(resource: Disposable | AsyncDisposable): void {
    if (this.#disposed) {
      if (hasAsyncDispose(resource)) {
        void resource[Symbol.asyncDispose]();
      } else {
        resource[Symbol.dispose]();
      }
      return;
    }
    this.#resources.push(resource);
    this.#trace.push(`async:${resource.constructor?.name ?? 'anonymous'}`);
  }

  syncSnapshot(): readonly string[] {
    return [...this.#trace];
}

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const resource of [...this.#resources].reverse()) {
      if (hasSyncDispose(resource)) {
        resource[Symbol.dispose]();
      }
    }
    this.#resources.length = 0;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const resources = [...this.#resources].reverse();
    for (const resource of resources) {
      if (hasAsyncDispose(resource)) {
        await resource[Symbol.asyncDispose]();
      } else {
        resource[Symbol.dispose]();
      }
    }
    this.#resources.length = 0;
  }
}

export interface SessionScopeOptions {
  readonly namespace: string;
  readonly allowNestedDisposal: boolean;
}

export class SessionScope {
  readonly #stack: AsyncDisposableStack;
  readonly #namespace: string;
  #disposed = false;

  constructor(options: SessionScopeOptions) {
    this.#stack = new AsyncDisposableStack();
    this.#namespace = `${options.namespace}::nested:${String(options.allowNestedDisposal)}`;
  }

  createResource<T extends DisposableResource>(id: string, value: T): T {
    if (this.#disposed) {
      throw new Error(`scope closed: ${this.#namespace}`);
    }
    const resource = value as unknown as Disposable;
    this.#stack.use(resource);
    return value;
  }

  trackAsync<T extends AsyncDisposableResource>(resource: T): T {
    if (this.#disposed) {
      void resource[Symbol.asyncDispose]();
      return resource;
    }
    this.#stack.use(resource);
    return resource;
  }

  async close(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await disposeAsyncStack(this.#stack);
  }

  get namespace(): string {
    return this.#namespace;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    disposeSyncStack(this.#stack);
  }
}

export interface ScopeResult<T> {
  readonly namespace: string;
  readonly value: T;
  readonly snapshots: readonly string[];
}

export const withSessionScope = async <T>(
  namespace: string,
  callback: (scope: SessionScope) => Promise<T>,
): Promise<ScopeResult<T>> => {
  await using scope = new SessionScope({ namespace, allowNestedDisposal: true });
  const value = await callback(scope);
  const snapshots = [
    `${scope.namespace}:start`,
    `${scope.namespace}:finish`,
  ];
  return { namespace: scope.namespace, value, snapshots };
};

export const withScope = async <T>(
  callback: (scope: ScopeSession) => Promise<T>,
): Promise<T> => {
  const scope = new ScopeSession('signal-runtime');
  try {
    return await callback(scope);
  } finally {
    await scope[Symbol.asyncDispose]();
  }
};
