import type { EventEnvelope } from './types';

export type IteratorChain<T> = IterableIterator<T> & {
  map<U>(transform: (value: T) => U): IteratorChain<U>;
  filter(predicate: (value: T) => boolean): IteratorChain<T>;
  take(limit: number): IteratorChain<T>;
  sort(compare: (left: T, right: T) => number): IteratorChain<T>;
  toArray(): T[];
  readonly first: T | undefined;
  joinToString(separator?: string): string;
};

const iteratorOf = <T>(values: Iterable<T>) => values[Symbol.iterator]();

class ArrayIteratorChain<T> implements IteratorChain<T> {
  #index = 0;
  readonly #values: readonly T[];

  constructor(values: Iterable<T>) {
    this.#values = [...values];
  }

  [Symbol.iterator](): IterableIterator<T> {
    this.#index = 0;
    return this;
  }

  next(): IteratorResult<T> {
    if (this.#index >= this.#values.length) {
      return { done: true, value: undefined as never };
    }
    return { done: false, value: this.#values[this.#index++] };
  }

  map<U>(transform: (value: T) => U): IteratorChain<U> {
    return createIteratorChain(this.#values.map(transform));
  }

  filter(predicate: (value: T) => boolean): IteratorChain<T> {
    return createIteratorChain(this.#values.filter(predicate));
  }

  take(limit: number): IteratorChain<T> {
    if (limit <= 0) {
      return createIteratorChain([]);
    }
    return createIteratorChain(this.#values.slice(0, limit));
  }

  sort(compare: (left: T, right: T) => number): IteratorChain<T> {
    return createIteratorChain([...this.#values].sort(compare));
  }

  toArray(): T[] {
    return this.#values.slice();
  }

  get first(): T | undefined {
    return this.#values.at(0);
  }

  joinToString(separator = ','): string {
    return this.toArray().join(separator);
  }
}

export const createIteratorChain = <T>(input: Iterable<T>): IteratorChain<T> => {
  const iterator = iteratorOf(input);
  return new ArrayIteratorChain({
    [Symbol.iterator]() {
      return iterator;
    },
  });
};
export const collectUnique = <T>(values: Iterable<T>): readonly T[] => {
  const seen = new Set<T>();
  const unique: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
};

export const pairWithPrevious = <T>(values: readonly T[]): readonly [T, T][] => {
  return values.slice(1).map((value, index) => [values[index] as T, value]);
};

export const collectByKind = <K extends string>(events: Iterable<EventEnvelope<K, string, unknown>>): Record<K, EventEnvelope<K, string, unknown>[]> => {
  const grouped = {} as Record<K, EventEnvelope<K, string, unknown>[]>;
  for (const event of events) {
    if (!grouped[event.kind as K]) {
      grouped[event.kind as K] = [];
    }
    grouped[event.kind as K].push(event);
  }
  return grouped;
};

export const topologicalByWeight = <T extends { readonly weight: number }>(values: readonly T[]): readonly T[] =>
  [...values].sort((left, right) => left.weight - right.weight);
