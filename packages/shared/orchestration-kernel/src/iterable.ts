import type { DeepReadonly } from './types';

export interface AsyncPair<T, U> {
  readonly left: T;
  readonly right: U;
}

export interface ChainStep<T> {
  map: <U>(mapFn: (value: T) => U) => IteratorChain<U>;
  filter: (pred: (value: T) => boolean) => IteratorChain<T>;
  take: (count: number) => IteratorChain<T>;
  chunk: (size: number) => IteratorChain<readonly T[]>;
  toAsync: () => AsyncIterable<T>;
  toArray: () => T[];
  toMap<K, V>(key: (value: T) => K, value: (value: T) => V): Map<K, V>;
}

export class IteratorChain<T> implements Iterable<T>, ChainStep<T> {
  #root: Iterable<T>;

  constructor(root: Iterable<T>) {
    this.#root = root;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.#root[Symbol.iterator]();
  }

  map<U>(mapFn: (value: T) => U): IteratorChain<U> {
    const mapped = {
      [Symbol.iterator]: (): Iterator<U> => {
        const iterator = this[Symbol.iterator]();
        return {
          next: (): IteratorResult<U> => {
            const next = iterator.next();
            if (next.done) {
              return { done: true, value: undefined as never };
            }
            return { done: false, value: mapFn(next.value) };
          },
        };
      },
    };
    return new IteratorChain(mapped);
  }

  filter(pred: (value: T) => boolean): IteratorChain<T> {
    const filtered = {
      [Symbol.iterator]: (): Iterator<T> => {
        const iterator = this[Symbol.iterator]();
        return {
          next: (): IteratorResult<T> => {
            while (true) {
              const next = iterator.next();
              if (next.done) {
                return next;
              }
              if (pred(next.value)) {
                return next;
              }
            }
          },
        };
      },
    };
    return new IteratorChain(filtered);
  }

  take(count: number): IteratorChain<T> {
    const safeCount = Math.max(0, Math.floor(count));
    const taken = {
      [Symbol.iterator]: (): Iterator<T> => {
        const iterator = this[Symbol.iterator]();
        let seen = 0;
        return {
          next: (): IteratorResult<T> => {
            if (seen >= safeCount) {
              return { done: true, value: undefined as never };
            }
            const next = iterator.next();
            if (next.done) {
              return next;
            }
            seen += 1;
            return next;
          },
        };
      },
    };
    return new IteratorChain(taken);
  }

  chunk(size: number): IteratorChain<readonly T[]> {
    const safeSize = Math.max(1, Math.floor(size));
    const chunked = {
      [Symbol.iterator]: (): Iterator<readonly T[]> => {
        const iterator = this[Symbol.iterator]();
        return {
          next: (): IteratorResult<readonly T[]> => {
            const values: T[] = [];
            while (values.length < safeSize) {
              const next = iterator.next();
              if (next.done) {
                break;
              }
              values.push(next.value);
            }
            if (values.length === 0) {
              return { done: true, value: undefined as never };
            }
            return { done: false, value: values };
          },
        };
      },
    };
    return new IteratorChain(chunked);
  }

  toAsync(): AsyncIterable<T> {
    const sync = this;
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const item of sync) {
          yield item;
        }
      },
    };
  }

  toMap<K, V>(key: (value: T) => K, value: (value: T) => V): Map<K, V> {
    const target = new Map<K, V>();
    for (const item of this) {
      target.set(key(item), value(item));
    }
    return target;
  }

  toArray(): T[] {
    return Array.from(this);
  }
}

export const chain = <T>(values: Iterable<T>): IteratorChain<T> => new IteratorChain(values);

export const fromEntries = <T extends Record<string, unknown>>(entries: Iterable<T>): DeepReadonly<T[]> =>
  [...entries] as unknown as DeepReadonly<T[]>;

export async function* zipAsync<T, U>(
  left: AsyncIterable<T>,
  right: AsyncIterable<U>,
): AsyncGenerator<AsyncPair<T, U>> {
  const leftIterator = left[Symbol.asyncIterator]();
  const rightIterator = right[Symbol.asyncIterator]();
  while (true) {
    const [leftNext, rightNext] = await Promise.all([leftIterator.next(), rightIterator.next()]);
    if (leftNext.done || rightNext.done) {
      return;
    }
    yield { left: leftNext.value, right: rightNext.value };
  }
}

export const pairwise = <T>(values: Iterable<T>): IteratorChain<readonly [T, T]> => {
  const entries = {
    [Symbol.iterator]: (): Iterator<readonly [T, T]> => {
      const iterator = values[Symbol.iterator]();
      let previous: T | undefined;
      let hasPrevious = false;
      return {
        next: (): IteratorResult<readonly [T, T]> => {
          if (!hasPrevious) {
            const first = iterator.next();
            if (first.done) {
              return { done: true, value: undefined as never };
            }
            previous = first.value;
            hasPrevious = true;
          }
          const next = iterator.next();
          if (next.done || previous === undefined) {
            return { done: true, value: undefined as never };
          }
          const pair: readonly [T, T] = [previous, next.value];
          previous = next.value;
          return { done: false, value: pair };
        },
      };
    },
  };
  return new IteratorChain(entries);
};
