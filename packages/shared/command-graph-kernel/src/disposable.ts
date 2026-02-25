export class AsyncCounter {
  #count = 0;

  increment(): void {
    this.#count += 1;
  }

  decrement(): void {
    this.#count -= 1;
  }

  get value(): number {
    return this.#count;
  }
}

export class ScopedRegistry implements AsyncDisposable {
  readonly #active = new Set<string>();

  open(key: string): { readonly key: string; readonly close: () => void } {
    this.#active.add(key);
    return {
      key,
      close: () => {
        this.#active.delete(key);
      },
    };
  }

  get size(): number {
    return this.#active.size;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return new Promise((resolve) => {
      this.#active.clear();
      resolve();
    });
  }
}

export const withAsyncDispose = async <T>(
  action: (stack: AsyncDisposableStack, registry: ScopedRegistry) => Promise<T>,
): Promise<T> => {
  await using stack = new AsyncDisposableStack();
  const registry = new ScopedRegistry();
  stack.defer(() => registry[Symbol.asyncDispose]());
  return action(stack, registry);
};
