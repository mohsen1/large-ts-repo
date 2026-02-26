import type { Brand } from '@shared/type-level';

type DisposableHandle = {
  readonly id: string;
  [Symbol.dispose](): void;
};

type AsyncDisposableHandle = {
  readonly id: string;
  [Symbol.asyncDispose](): Promise<void>;
};

type DisposableOrAsync = {
  readonly id: string;
} & ({ [Symbol.dispose](): void } | { [Symbol.asyncDispose](): Promise<void> });

export interface DisposerConfig {
  readonly namespace: string;
  readonly label: string;
  readonly autoClose: boolean;
}

export interface DisposableScope {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
  readonly trace: ReadonlyArray<string>;
}

export class StageHandle implements DisposableScope {
  readonly #trace: string[] = [];
  readonly #namespace: string;
  readonly #label: string;

  constructor(config: DisposerConfig) {
    this.#namespace = config.namespace;
    this.#label = config.label;
    this.#trace.push(`open:${config.namespace}:${config.label}`);
  }

  track(value: DisposableOrAsync): void {
    this.#trace.push(`track:${value.id}`);
  }

  [Symbol.dispose](): void {
    this.#trace.push(`close:${this.#namespace}`);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#trace.push(`async-close:${this.#label}`);
  }

  get trace(): ReadonlyArray<string> {
    return [...this.#trace];
  }
}

type AsyncStackLike = {
  use<T extends Disposable | AsyncDisposable>(value: T): T;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

const getAsyncStack = (): new () => AsyncStackLike => {
  const globalWithStack = globalThis as unknown as { readonly AsyncDisposableStack?: { new (): AsyncStackLike } };
  const ctor = globalWithStack.AsyncDisposableStack;
  if (ctor) {
    return ctor;
  }

  class FallbackAsyncDisposableStack {
    readonly #values: Array<DisposableOrAsync> = [];
    use<T extends Disposable | AsyncDisposable>(value: T): T {
      if (typeof value === 'object' && value !== null) {
        this.#values.push(value as unknown as DisposableOrAsync);
      }
      return value;
    }
    [Symbol.dispose](): void {
      for (const value of [...this.#values].reverse()) {
        if (value && typeof value === 'object' && Symbol.dispose in value) {
          (value as DisposableHandle)[Symbol.dispose]();
        }
      }
      this.#values.length = 0;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      for (const value of [...this.#values].reverse()) {
        if (value && typeof value === 'object' && Symbol.asyncDispose in value) {
          await (value as AsyncDisposableHandle)[Symbol.asyncDispose]();
        } else if (value && typeof value === 'object' && Symbol.dispose in value) {
          (value as DisposableHandle)[Symbol.dispose]();
        }
      }
      this.#values.length = 0;
    }
  }

  return FallbackAsyncDisposableStack;
};

export const withScope = async <TResult, TId extends string>(
  namespace: TId,
  callback: (scope: StageHandle, token: Brand<TId, 'ScopeToken'>) => Promise<TResult>,
): Promise<{ readonly result: TResult; readonly token: Brand<TId, 'ScopeToken'>; readonly trace: ReadonlyArray<string> }> => {
  const StackType = getAsyncStack();
  const stack = new StackType();
  await using _stack = stack;
  const scope = new StageHandle({ namespace, label: `scope:${namespace}`, autoClose: true });
  stack.use(scope);
  const token = `${namespace}:${Date.now()}` as Brand<TId, 'ScopeToken'>;
  const result = await callback(scope, token);
  return {
    result,
    token,
    trace: scope.trace,
  };
};

export const auditFlow = async (): Promise<ReadonlyArray<string>> => {
  const output: string[] = [];
  const session = await withScope('audit-root', async (scope, token) => {
    output.push(`token:${token}`);
    const asyncSeed = {
      id: `seed:${token}`,
      [Symbol.dispose]: () => {
        output.push(`dispose:${token}`);
      },
      [Symbol.asyncDispose]: async () => {
        output.push(`async-dispose:${token}`);
      },
    } satisfies DisposableOrAsync;
    scope.track(asyncSeed);
    const payload = {
      id: `payload:${token}`,
      [Symbol.dispose]: () => {
        output.push(`payload-dispose:${token}`);
      },
    } satisfies DisposableHandle;
    scope.track(payload);
    await scope[Symbol.asyncDispose]();
    return token;
  });
  output.push(...session.trace);
  return output;
};
