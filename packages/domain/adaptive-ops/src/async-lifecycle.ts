export interface AsyncResource {
  [Symbol.asyncDispose](): Promise<void>;
}

export interface DisposeReport {
  label: string;
  acquiredAt: string;
  disposedAt?: string;
  disposed: boolean;
  failures: readonly string[];
}

type StackLike = {
  use<T extends AsyncResource>(resource: T): T;
  adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type MaybeAsyncStack = { new (): StackLike };

const globalStackCtor = (): MaybeAsyncStack => {
  const candidate = (globalThis as unknown as { AsyncDisposableStack?: MaybeAsyncStack }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }

  return class FallbackAsyncDisposableStack implements StackLike {
    private readonly disposers: Array<() => Promise<void> | void> = [];

    use<T extends AsyncResource>(resource: T): T {
      this.adopt(resource, (value) => value[Symbol.asyncDispose]());
      return resource;
    }

    adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T {
      this.disposers.push(() => onDispose(resource));
      return resource;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
        await this.disposers[index]?.();
      }
    }
  };
};

const AsyncStackCtor = globalStackCtor();

export class NamedResource<T> implements AsyncResource {
  private disposed = false;
  constructor(readonly label: string, readonly value: T, private readonly onDispose?: (value: T) => Promise<void> | void) {}

  [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    this.disposed = true;
    return Promise.resolve(this.onDispose?.(this.value)).then(() => undefined);
  }
}

export class ScopedState implements AsyncResource {
  #active = true;
  readonly traces: string[] = [];
  constructor(readonly id: string) {
    this.traces.push(`enter:${id}`);
  }

  [Symbol.asyncDispose](): Promise<void> {
    if (!this.#active) return Promise.resolve();
    this.#active = false;
    this.traces.push(`leave:${this.id}`);
    return Promise.resolve();
  }
}

export const createAsyncScope = async <T>(label: string, task: (stack: StackLike) => Promise<T>): Promise<T> => {
  await using scope = new AsyncStackCtor();
  scope.adopt(new ScopedState(label), (state) => {
    state[Symbol.asyncDispose]();
  });
  try {
    return await task(scope);
  } finally {
    await scope[Symbol.asyncDispose]();
  }
};

const toReport = (label: string, failures: readonly string[], disposedAt: Date): DisposeReport => ({
  label,
  acquiredAt: new Date(Date.now() - 100).toISOString(),
  disposedAt: disposedAt.toISOString(),
  disposed: true,
  failures,
});

export const collectScopeReport = async (label: string): Promise<DisposeReport> => {
  const failures: string[] = [];
  let report: DisposeReport;
  try {
    await createAsyncScope(label, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    report = toReport(label, failures, new Date());
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    report = toReport(label, failures, new Date());
  }
  return report;
};

export const wrapDisposable = <T>(label: string, value: T, onDispose?: (value: T) => Promise<void> | void): AsyncResource => {
  return new NamedResource(label, value, onDispose);
};
