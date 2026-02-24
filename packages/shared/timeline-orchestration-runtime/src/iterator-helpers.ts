export interface IteratorCursor<T> {
  readonly value: T;
  readonly atEnd: boolean;
}

export interface IterableToolkit<T> extends Iterable<T> {
  map<TNext>(mapper: (value: T, index: number) => TNext): IterableToolkit<TNext>;
  filter(predicate: (value: T, index: number) => boolean): IterableToolkit<T>;
  reduce<TSeed>(seed: TSeed, reducer: (seed: TSeed, value: T, index: number) => TSeed): TSeed;
  toArray(): T[];
  every(predicate: (value: T, index: number) => boolean): boolean;
  take(count: number): IterableToolkit<T>;
  chunks(size: number): IterableToolkit<T[]>;
  collect(): T[];
  cursor(): IteratorCursor<T | null>;
}

function iteratorFrom<T>(iterable: Iterable<T>): Iterator<T> {
  return iterable[Symbol.iterator]();
}

function createIterableToolkit<T>(iterable: Iterable<T>): IterableToolkit<T> {
  return {
    *[Symbol.iterator]() {
      for (const value of iterable) {
        yield value;
      }
    },
    map(mapper) {
      return createIterableToolkit({
        *[Symbol.iterator]() {
          let index = 0;
          const iterator = iteratorFrom(iterable);
          while (true) {
            const next = iterator.next();
            if (next.done) {
              return;
            }

            yield mapper(next.value, index);
            index += 1;
          }
        },
      });
    },
    filter(predicate) {
      return createIterableToolkit({
        *[Symbol.iterator]() {
          let index = 0;
          const iterator = iteratorFrom(iterable);
          while (true) {
            const next = iterator.next();
            if (next.done) {
              return;
            }

            if (predicate(next.value, index)) {
              yield next.value;
            }
            index += 1;
          }
        },
      });
    },
    reduce(seed, reducer) {
      let accumulator = seed;
      let index = 0;
      const iterator = iteratorFrom(iterable);
      while (true) {
        const next = iterator.next();
        if (next.done) {
          return accumulator;
        }
        accumulator = reducer(accumulator, next.value, index);
        index += 1;
      }
    },
    toArray() {
      return [...iterable];
    },
    collect() {
      return [...iterable];
    },
    every(predicate) {
      let index = 0;
      const iterator = iteratorFrom(iterable);
      while (true) {
        const next = iterator.next();
        if (next.done) {
          return true;
        }
        if (!predicate(next.value, index)) {
          return false;
        }
        index += 1;
      }
    },
    take(count) {
      return createIterableToolkit({
        *[Symbol.iterator]() {
          let taken = 0;
          const iterator = iteratorFrom(iterable);
          while (true) {
            const next = iterator.next();
            if (next.done || taken >= count) {
              return;
            }
            yield next.value;
            taken += 1;
          }
        },
      });
    },
    chunks(size) {
      return createIterableToolkit({
        *[Symbol.iterator]() {
          let chunk: T[] = [];
          const iterator = iteratorFrom(iterable);
          while (true) {
            const next = iterator.next();
            if (next.done) {
              if (chunk.length > 0) {
                yield chunk;
              }
              return;
            }

            chunk.push(next.value);
            if (chunk.length === size) {
              yield chunk;
              chunk = [];
            }
          }
        },
      });
    },
    cursor() {
      const iterator = iteratorFrom(iterable);
      const result = iterator.next();
      return {
        value: result.done ? null : result.value,
        atEnd: result.done === true,
      };
    },
  };
}

export function iter<T>(source: Iterable<T>): IterableToolkit<T> {
  return createIterableToolkit(source);
}

export function pairwise<T>(source: Iterable<T>): IterableToolkit<[T, T | undefined]> {
  return createIterableToolkit({
    *[Symbol.iterator]() {
      let iterator = iteratorFrom(source);
      const first = iterator.next();
      if (first.done) {
        return;
      }

      let previous = first.value;
      while (true) {
        const next = iterator.next();
        if (next.done) {
          yield [previous, undefined];
          return;
        }
        yield [previous, next.value];
        previous = next.value;
      }
    },
  });
}

export function zipIterables<A, B>(left: Iterable<A>, right: Iterable<B>): IterableToolkit<[A, B]> {
  return createIterableToolkit({
    *[Symbol.iterator]() {
      const leftIter = iteratorFrom(left);
      const rightIter = iteratorFrom(right);

      while (true) {
        const leftNext = leftIter.next();
        const rightNext = rightIter.next();
        if (leftNext.done || rightNext.done) {
          return;
        }
        yield [leftNext.value, rightNext.value];
      }
    },
  });
}

export function slidingWindow<T>(source: Iterable<T>, width: number): IterableToolkit<T[]> {
  return createIterableToolkit({
    *[Symbol.iterator]() {
      const values = [...source];
      if (width <= 1) {
        for (const value of values) {
          yield [value];
        }
        return;
      }
      for (let index = 0; index + width <= values.length; index += 1) {
        yield values.slice(index, index + width);
      }
    },
  });
}

export function rankBy<T, K extends PropertyKey>(source: Iterable<T>, selector: (value: T) => K): Map<K, number> {
  const ranking = new Map<K, number>();
  for (const value of source) {
    const key = selector(value);
    ranking.set(key, (ranking.get(key) ?? 0) + 1);
  }
  return ranking;
}
