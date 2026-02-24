type DisposeToken = symbol;

const disposeSymbol = ((Symbol as { dispose?: symbol }).dispose ?? Symbol.for('Symbol.dispose')) as DisposeToken;
const asyncDisposeSymbol = ((Symbol as { asyncDispose?: symbol }).asyncDispose ?? Symbol.for('Symbol.asyncDispose')) as DisposeToken;
const asyncDisposalResult = (value: Promise<void> | void): Promise<void> =>
  value instanceof Promise ? value : Promise.resolve(value);

type SyncDisposer = () => void;
type AsyncDisposer = () => Promise<void>;

export interface ScopedResource<T = unknown> {
  readonly value: T;
  readonly dispose?: SyncDisposer;
  readonly asyncDispose?: AsyncDisposer;
}

export class OrchestrationScope {
  readonly #resources = new Set<ScopedResource>();
  #closed = false;

  register<T>(value: T, options?: { dispose?: SyncDisposer; asyncDispose?: AsyncDisposer }): T {
    this.#resources.add({
      value,
      dispose: options?.dispose,
      asyncDispose: options?.asyncDispose,
    });
    return value;
  }

  [Symbol.dispose](): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    for (const resource of [...this.#resources].reverse()) {
      resource.dispose?.();
      if (!resource.asyncDispose) {
        this.#resources.delete(resource);
      }
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    for (const resource of [...this.#resources].reverse()) {
      if (resource.asyncDispose) {
        await asyncDisposalResult(resource.asyncDispose());
      } else {
        resource.dispose?.();
      }
      this.#resources.delete(resource);
    }
  }

  snapshotCount(): number {
    return this.#resources.size;
  }
}

export const withScope = async <T>(work: (scope: OrchestrationScope) => Promise<T>): Promise<T> => {
  using scope = new OrchestrationScope();
  return work(scope);
};

export const withSyncScope = <T>(work: (scope: OrchestrationScope) => T): T => {
  using scope = new OrchestrationScope();
  return work(scope);
};

export const createScope = (): OrchestrationScope => new OrchestrationScope();

export const disposeSymbolKey = disposeSymbol;
export const asyncDisposeSymbolKey = asyncDisposeSymbol;
