import type { SagaErrorScope } from './types';

export interface AsyncCleanup {
  [Symbol.asyncDispose](): Promise<void>;
}

export interface SyncCleanup {
  [Symbol.dispose](): void;
}

type AsyncStackLike = {
  use<T extends { [Symbol.asyncDispose]?: () => PromiseLike<void> | void }>(value: T): T;
  adopt<T>(value: T, onDispose: (value: T) => PromiseLike<void> | void): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type SyncStackLike = {
  use<T extends { [Symbol.dispose]?: () => void }>(value: T): T;
  adopt<T>(value: T, onDispose: (value: T) => void): T;
  [Symbol.dispose](): void;
};

type AsyncStackCtor = new () => AsyncStackLike;
type SyncStackCtor = new () => SyncStackLike;

const globalAsyncStackCtor = (): AsyncStackCtor => {
  const Candidate = (globalThis as { AsyncDisposableStack?: AsyncStackCtor }).AsyncDisposableStack;
  if (Candidate) {
    return Candidate;
  }
  return class FallbackAsyncDisposableStack implements AsyncStackLike {
    readonly #disposers: Array<() => PromiseLike<void> | void> = [];

    use<T extends { [Symbol.asyncDispose]?: () => PromiseLike<void> | void }>(value: T): T {
      this.adopt(value, (resource) => resource[Symbol.asyncDispose]?.());
      return value;
    }

    adopt<T>(value: T, onDispose: (value: T) => PromiseLike<void> | void): T {
      this.#disposers.push(() => onDispose(value));
      return value;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        await this.#disposers[index]?.();
      }
    }
  };
};

const globalSyncStackCtor = (): SyncStackCtor => {
  const Candidate = (globalThis as { DisposableStack?: SyncStackCtor }).DisposableStack;
  if (Candidate) {
    return Candidate;
  }
  return class FallbackDisposableStack implements SyncStackLike {
    readonly #disposals: Array<() => void> = [];

    use<T extends { [Symbol.dispose]?: () => void }>(value: T): T {
      this.adopt(value, (resource) => resource[Symbol.dispose]?.());
      return value;
    }

    adopt<T>(value: T, onDispose: (value: T) => void): T {
      this.#disposals.push(() => onDispose(value));
      return value;
    }

    [Symbol.dispose](): void {
      for (let index = this.#disposals.length - 1; index >= 0; index -= 1) {
        this.#disposals[index]?.();
      }
    }
  };
};

const AsyncStackCtor = globalAsyncStackCtor();
const SyncStackCtor = globalSyncStackCtor();

export const createSyncScope = () => new SyncStackCtor();

export class ScopedMarker implements SyncCleanup {
  #active = true;

  constructor(
    private readonly label: string,
    private readonly onDispose?: () => void,
  ) {
    void label;
  }

  [Symbol.dispose](): void {
    if (!this.#active) return;
    this.#active = false;
    this.onDispose?.();
  }
}

export class ScopedAsyncMarker implements AsyncCleanup {
  #active = true;

  constructor(
    private readonly label: string,
    private readonly onDispose?: () => Promise<void> | void,
  ) {
    void label;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.#active) return;
    this.#active = false;
    await Promise.resolve(this.onDispose?.());
  }
}

export async function withAsyncScope<T>(work: (scope: AsyncStackLike) => Promise<T>): Promise<T> {
  await using scope = new AsyncStackCtor();
  return await work(scope);
}

export function withSyncScope<T>(work: (scope: SyncStackLike) => T): T {
  using scope = new SyncStackCtor();
  return work(scope);
}

export const withScopedAsyncResource = async <T>(work: () => Promise<T>): Promise<T> => {
  return withAsyncScope(async () => work());
};

export class SagaErrorCollector {
  readonly #errors: SagaErrorScope[] = [];

  add(scope: SagaErrorScope): void {
    this.#errors.push(scope);
  }

  get list(): readonly SagaErrorScope[] {
    return [...this.#errors];
  }

  clear(): void {
    this.#errors.length = 0;
  }
}

