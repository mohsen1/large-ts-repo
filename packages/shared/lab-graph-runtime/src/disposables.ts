type SyncDisposable = { [Symbol.dispose](): void };
type AsyncDisposable = { [Symbol.asyncDispose](): PromiseLike<void> };
type AnyDisposable = SyncDisposable | AsyncDisposable;

interface AsyncStackLike {
  adopt<T extends { [Symbol.dispose]?: () => void; [Symbol.asyncDispose]?: () => PromiseLike<void> }>(
    resource: T,
    dispose: (resource: T) => void | PromiseLike<void>,
  ): T;
  asyncDispose?(): PromiseLike<void>;
  dispose?(): void;
}

const getNativeAsyncStack = (): { new (): AsyncStackLike } | undefined =>
  (globalThis as { AsyncDisposableStack?: { new (): AsyncStackLike } }).AsyncDisposableStack;

class FallbackAsyncStack implements AsyncStackLike {
  readonly #disposers: Array<() => void | PromiseLike<void>> = [];

  adopt<T extends { [Symbol.dispose]?: () => void; [Symbol.asyncDispose]?: () => PromiseLike<void> }>(
    resource: T,
    dispose: (resource: T) => void | PromiseLike<void>,
  ): T {
    this.#disposers.push(() => dispose(resource));
    return resource;
  }

  dispose(): void {
    while (this.#disposers.length > 0) {
      const fn = this.#disposers.pop();
      void fn?.();
    }
  }

  async asyncDispose(): Promise<void> {
    for (const dispose of this.#disposers.splice(0, this.#disposers.length).reverse()) {
      await dispose();
    }
  }
}

export interface PluginScope<TState extends Record<string, unknown>> extends Disposable, AsyncDisposable {
  readonly state: TState;
  use<TResource extends { [Symbol.dispose]?: () => void; [Symbol.asyncDispose]?: () => PromiseLike<void> }>(
    resource: TResource,
  ): TResource;
  setState(state: TState): void;
  getState(): string;
  metrics(): Promise<number>;
}

export class DefaultPluginScope<TState extends Record<string, unknown>> implements PluginScope<TState> {
  readonly #stack: AsyncStackLike =
    getNativeAsyncStack?.() !== undefined ? new (getNativeAsyncStack() as new () => AsyncStackLike)() : new FallbackAsyncStack();
  #state: TState;
  #marks: string[] = [];

  constructor(initial: TState) {
    this.#state = initial;
  }

  get state(): TState {
    return this.#state;
  }

  setState(state: TState): void {
    this.#state = state;
  }

  getState(): string {
    return this.#marks.at(-1) ?? '';
  }

  async metrics(): Promise<number> {
    return this.#marks.reduce((total, label, index) => total + label.length + index, 0);
  }

  use<TResource extends { [Symbol.dispose]?: () => void; [Symbol.asyncDispose]?: () => PromiseLike<void> }>(
    resource: TResource,
  ): TResource {
    return this.#stack.adopt(resource, (candidate) => {
      candidate[Symbol.asyncDispose]?.();
      candidate[Symbol.dispose]?.();
    });
  }

  [Symbol.dispose](): void {
    this.#stack.dispose?.();
    this.#marks = [];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack.asyncDispose?.();
    this.#marks = [];
  }
}

export const createPluginScope = <TState extends Record<string, unknown>>(state: TState): PluginScope<TState> => {
  return new DefaultPluginScope(state);
};
