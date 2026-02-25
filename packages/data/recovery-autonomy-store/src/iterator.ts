export interface IterableBatch<T> {
  readonly values: Iterable<T>;
  map<U>(mapper: (value: T, index: number) => U): IterableBatch<U>;
  filter(predicate: (value: T, index: number) => boolean): IterableBatch<T>;
  reduce<U>(seed: U, reducer: (acc: U, value: T, index: number) => U): U;
  toArray(): readonly T[];
  toSet(): Set<T>;
}

class IterableBatchImpl<T> implements IterableBatch<T> {
  readonly values: Iterable<T>;

  constructor(values: Iterable<T>) {
    this.values = values;
  }

  *[Symbol.iterator](): IterableIterator<T> {
    yield* this.values;
  }

  map<U>(mapper: (value: T, index: number) => U): IterableBatch<U> {
    const source = this.values;
    const output = (function* () {
      let index = 0;
      for (const value of source) {
        yield mapper(value, index);
        index += 1;
      }
    })();

    return new IterableBatchImpl(output);
  }

  filter(predicate: (value: T, index: number) => boolean): IterableBatch<T> {
    const source = this.values;
    const output = (function* () {
      let index = 0;
      for (const value of source) {
        if (predicate(value, index)) {
          yield value;
        }
        index += 1;
      }
    })();

    return new IterableBatchImpl(output);
  }

  reduce<U>(seed: U, reducer: (acc: U, value: T, index: number) => U): U {
    let index = 0;
    let output = seed;
    for (const value of this.values) {
      output = reducer(output, value, index);
      index += 1;
    }
    return output;
  }

  toArray(): readonly T[] {
    return [...this];
  }

  toSet(): Set<T> {
    return new Set(this.toArray());
  }
}

export const iterate = <T>(input: Iterable<T>): IterableBatch<T> => new IterableBatchImpl(input);

export const uniqueBy = <T, K>(input: Iterable<T>, selector: (value: T) => K): readonly T[] => {
  const output: T[] = [];
  const seen = new Set<K>();
  for (const value of input) {
    const key = selector(value);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(value);
    }
  }
  return output;
};
