import type { NoInfer } from './types';

type TelemetrySample = {
  readonly label: string;
  readonly createdAt: number;
  readonly endedAt?: number;
};

type DisposableHandle = {
  [Symbol.dispose](): void;
};

type AsyncDisposableHandle = {
  [Symbol.asyncDispose](): Promise<void>;
};

export interface QuantumScope {
  readonly scopeId: string;
  mark(message: string): void;
  flush(): readonly TelemetrySample[];
}

export class QuantumScopeHandle implements DisposableHandle, QuantumScope {
  readonly #scopeId: string;
  #samples: TelemetrySample[] = [];
  #ended = false;

  constructor(scopeId: string) {
    this.#scopeId = scopeId;
    this.mark('start');
  }

  get scopeId(): string {
    return this.#scopeId;
  }

  mark(message: string): void {
    if (this.#ended) {
      return;
    }
    this.#samples.push({
      label: message,
      createdAt: Date.now(),
    });
  }

  flush(): readonly TelemetrySample[] {
    return [...this.#samples];
  }

  [Symbol.dispose](): void {
    this.#ended = true;
    this.#samples.push({
      label: 'dispose',
      createdAt: Date.now(),
      endedAt: Date.now(),
    });
  }
}

export class QuantumAsyncScopeHandle implements AsyncDisposableHandle, QuantumScope {
  readonly #scopeId: string;
  readonly #limit: number;
  #samples: TelemetrySample[] = [];
  #closed = false;

  constructor(scopeId: string, limit: number) {
    this.#scopeId = scopeId;
    this.#limit = Math.max(2, Math.floor(limit));
    this.mark('start');
  }

  get scopeId(): string {
    return this.#scopeId;
  }

  mark(message: string): void {
    if (this.#closed) {
      return;
    }
    this.#samples.push({
      label: message,
      createdAt: Date.now(),
    });
  }

  flush(): readonly TelemetrySample[] {
    return [...this.#samples];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    this.#samples = this.#samples.slice(-this.#limit);
    this.#samples.push({
      label: 'async-dispose',
      createdAt: Date.now(),
      endedAt: Date.now(),
    });
    await Promise.resolve();
  }
}

export const withScope = <T>(label: string, cb: (scope: QuantumScope) => T): T => {
  using scope = new QuantumScopeHandle(label);
  return cb(scope);
};

export const withAsyncScope = async <T>(label: string, cb: (scope: QuantumAsyncScopeHandle) => Promise<T>): Promise<T> => {
  const stack = new AsyncDisposableStack();
  try {
    const scope = new QuantumAsyncScopeHandle(label, 64);
    stack.use(scope);
    return await cb(scope);
  } finally {
    await stack.disposeAsync();
  }
};

export const normalizeNoInfer = <T>(value: NoInfer<T>): T => value;
