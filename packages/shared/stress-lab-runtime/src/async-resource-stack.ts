type DisposableLike = {
  [Symbol.dispose]?(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
};

type AsyncDisposableCtor = new () => {
  use<T extends DisposableLike>(value: T): T;
  defer<T>(callback: () => void): void;
  disposeAsync(): Promise<void>;
};

type StackHandle = {
  use<T extends DisposableLike>(value: T): T;
  disposeAsync(): Promise<void>;
};

const resolveAsyncDisposableStack = (): AsyncDisposableCtor | undefined => {
  return (globalThis as { AsyncDisposableStack?: AsyncDisposableCtor }).AsyncDisposableStack;
};

const resolveSymbol = (kind: 'dispose' | 'asyncDispose'): symbol => {
  return kind === 'dispose'
    ? (Symbol as { dispose?: symbol }).dispose ?? Symbol.for('Symbol.dispose')
    : (Symbol as { asyncDispose?: symbol }).asyncDispose ?? Symbol.for('Symbol.asyncDispose');
};

const disposeSymbol = resolveSymbol('dispose');
const asyncDisposeSymbol = resolveSymbol('asyncDispose');
const StackCtor = resolveAsyncDisposableStack();

const createStack = (): StackHandle => {
  return StackCtor ? new StackCtor() : new FallbackAsyncResourceStack();
};

class FallbackAsyncResourceStack {
  readonly #disposers: Array<() => Promise<void> | void> = [];

  use<T extends DisposableLike>(resource: T): T {
    this.#disposers.push(() => {
      if (typeof resource[disposeSymbol as keyof DisposableLike] === 'function') {
        return (resource as unknown as { [disposeSymbol]: () => void })[disposeSymbol]();
      }
      if (typeof resource[asyncDisposeSymbol as keyof DisposableLike] === 'function') {
        return (resource as unknown as { [asyncDisposeSymbol]: () => Promise<void> })[asyncDisposeSymbol]();
      }
      return undefined;
    });
    return resource;
  }

  defer<T>(fn: () => void): void {
    this.#disposers.push(fn);
  }

  async disposeAsync(): Promise<void> {
    for (const dispose of [...this.#disposers].reverse()) {
      await dispose();
    }
  }
}

export interface ResourceScopeConfig {
  readonly tenantId: string;
  readonly requestId: string;
  readonly namespace: string;
}

export interface ResourceLease {
  readonly token: string;
  readonly namespace: string;
  readonly createdAt: number;
  readonly config: ResourceScopeConfig;
}

export class ResourceScope implements DisposableLike {
  readonly #stack: StackHandle;
  readonly #createdAt: number;
  readonly #resource: ResourceLease;
  readonly #scopeConfig: Readonly<ResourceScopeConfig>;
  #open = true;

  constructor(config: ResourceScopeConfig) {
    this.#scopeConfig = config;
    this.#createdAt = Date.now();
    this.#stack = createStack();
    this.#resource = {
      token: `lease:${config.tenantId}:${config.requestId}:${config.namespace}:${this.#createdAt}`,
      namespace: config.namespace,
      createdAt: this.#createdAt,
      config,
    };
    this.#stack.use(this);
  }

  get opened(): boolean {
    return this.#open;
  }

  get resource(): ResourceLease {
    return this.#resource;
  }

  close(): void {
    this.#open = false;
  }

  [Symbol.dispose](): void {
    this.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
    await this.#stack.disposeAsync();
  }

  [disposeSymbol](): void {
    this.close();
  }

  [asyncDisposeSymbol](): Promise<void> {
    this.close();
    return Promise.resolve();
  }
}

export const createScope = (config: ResourceScopeConfig): ResourceScope => new ResourceScope(config);

export const withScope = async <T>(
  config: ResourceScopeConfig,
  run: (scope: ResourceScope) => Promise<T> | T,
): Promise<T> => {
  await using scope = createScope(config);
  return run(scope);
};

export const withDisposable = <T>(
  value: DisposableLike,
  work: (value: DisposableLike) => T | Promise<T>,
): Promise<T> => {
  return usingScopeWork(value, async (stack) => {
    stack.use(value);
    return work(value);
  });
};

const usingScopeWork = <T>(value: DisposableLike, work: (stack: StackHandle) => Promise<T>): Promise<T> => {
  return withDisposableStack(async () => {
    const stack = createStack();
    stack.use(value);
    try {
      return await work(stack);
    } finally {
      await stack.disposeAsync();
    }
  });
};

const withDisposableStack = <T>(run: () => Promise<T>): Promise<T> => {
  return run();
};

const resourceDefaults = {
  tenantId: 'tenant-default',
  requestId: 'scope-default',
  namespace: 'recovery:stress:lab',
} as const;

export const attachLease = async <T>(
  tenantId: string,
  requestId: string,
  run: (lease: ResourceLease) => Promise<T>,
): Promise<T> => {
  return withScope(
    {
      tenantId,
      requestId,
      namespace: resourceDefaults.namespace,
    },
    async (scope) => run(scope.resource),
  );
};
