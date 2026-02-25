export interface IteratorHelpers<T> extends Iterable<T> {
  readonly length: number;

  filter(predicate: (value: T, index: number) => boolean): IteratorHelpers<T>;

  map<TResult>(selector: (value: T, index: number) => TResult): IteratorHelpers<TResult>;

  flatMap<TResult>(selector: (value: T, index: number) => Iterable<TResult>): IteratorHelpers<TResult>;

  take(count: number): IteratorHelpers<T>;

  skip(count: number): IteratorHelpers<T>;

  chunk(size: number): IteratorHelpers<readonly T[]>;

  reduce<TResult>(reducer: (acc: TResult, value: T, index: number) => TResult, initial: TResult): TResult;

  toArray(): readonly T[];

  first(defaultValue?: T): T | undefined;

  window(count: number): IteratorHelpers<readonly T[]>;
}

const normalizeCount = (count: number): number => Math.max(1, Math.floor(count));

const arrayFrom = <T>(values: Iterable<T>): T[] => {
  const snapshot = [...values];
  return snapshot;
};

const createIterator = <T>(values: readonly T[]): IteratorHelpers<T> => {
  const snapshot = [...values];

  const makeIterator = (): IterableIterator<T> =>
    (function* () {
      for (const value of snapshot) {
        yield value;
      }
    })();

  return {
    get length(): number {
      return snapshot.length;
    },

    [Symbol.iterator](): IterableIterator<T> {
      return makeIterator();
    },

    filter(predicate: (value: T, index: number) => boolean): IteratorHelpers<T> {
      const selected = snapshot.filter((value, index) => predicate(value, index));
      return createIterator(selected);
    },

    map<TResult>(selector: (value: T, index: number) => TResult): IteratorHelpers<TResult> {
      const selected = snapshot.map((value, index) => selector(value, index));
      return createIterator(selected);
    },

    flatMap<TResult>(selector: (value: T, index: number) => Iterable<TResult>): IteratorHelpers<TResult> {
      const selected = snapshot.flatMap((value, index) => arrayFrom(selector(value, index)));
      return createIterator(selected);
    },

    take(count: number): IteratorHelpers<T> {
      const takeCount = Math.max(0, Math.min(snapshot.length, normalizeCount(count)));
      return createIterator(snapshot.slice(0, takeCount));
    },

    skip(count: number): IteratorHelpers<T> {
      const skipCount = Math.max(0, normalizeCount(count));
      return createIterator(snapshot.slice(skipCount));
    },

    window(size: number): IteratorHelpers<readonly T[]> {
      const sliceSize = normalizeCount(size);
      const windows = snapshot.reduce<T[][]>((accumulator, value, index) => {
        if (index % sliceSize === 0) {
          accumulator.push([]);
        }
        const bucket = Math.floor(index / sliceSize);
        accumulator[bucket] = [...accumulator[bucket], value];
        return accumulator;
      }, []);
      return createIterator(windows as readonly T[][]);
    },

    chunk(size: number): IteratorHelpers<readonly T[]> {
      const sliceSize = normalizeCount(size);
      const chunks = snapshot.reduce<T[][]>((accumulator, value, index) => {
        const bucket = Math.floor(index / sliceSize);
        accumulator[bucket] = [...(accumulator[bucket] ?? []), value];
        return accumulator;
      }, []);
      return createIterator(chunks as readonly T[][]);
    },

    reduce<TResult>(reducer: (acc: TResult, value: T, index: number) => TResult, initial: TResult): TResult {
      return snapshot.reduce(reducer, initial);
    },

    first(defaultValue?: T): T | undefined {
      if (snapshot.length > 0) return snapshot[0];
      return defaultValue;
    },

    toArray(): readonly T[] {
      return [...snapshot];
    },
  };
};

export const iteratorChain = <T>(source: Iterable<T>): IteratorHelpers<T> => {
  return createIterator(arrayFrom(source));
};
