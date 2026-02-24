export interface SyntheticIterator<T> extends Iterable<T> {
  map<U>(mapper: (value: T, index: number) => U): SyntheticIterator<U>;
  filter(predicate: (value: T, index: number) => boolean): SyntheticIterator<T>;
  filter<TGuard extends T>(predicate: (value: T, index: number) => value is TGuard): SyntheticIterator<TGuard>;
  take(limit: number): SyntheticIterator<T>;
  zip<TRight>(right: Iterable<TRight>): SyntheticIterator<readonly [T, TRight]>;
  toArray(): readonly T[];
}

interface IterState<T> {
  readonly value: T;
  readonly index: number;
  done: boolean;
}

class ArrayIterator<T> implements SyntheticIterator<T> {
  private readonly source: readonly T[];

  constructor(source: Iterable<T>) {
    this.source = [...source];
  }

  *[Symbol.iterator](): Iterator<T> {
    yield* this.source;
  }

  map<U>(mapper: (value: T, index: number) => U): SyntheticIterator<U> {
    return new ArrayIterator(this.source.map(mapper));
  }

  filter(predicate: (value: T, index: number) => boolean): SyntheticIterator<T>;
  filter<TGuard extends T>(predicate: (value: T, index: number) => value is TGuard): SyntheticIterator<TGuard>;
  filter(predicate: (value: T, index: number) => boolean): SyntheticIterator<T> {
    const next = this.source.filter((value, index) => predicate(value, index));
    return new ArrayIterator(next);
  }

  take(limit: number): SyntheticIterator<T> {
    const bounded = this.source.slice(0, Math.max(0, Math.floor(limit)));
    return new ArrayIterator(bounded);
  }

  zip<TRight>(right: Iterable<TRight>): SyntheticIterator<readonly [T, TRight]> {
    const rightValues = [...right];
    const zipped = this.source.map((left, index) => [left, rightValues[index]] as const);
    return new ArrayIterator(zipped);
  }

  toArray(): readonly T[] {
    return [...this.source];
  }
}

export const asIterable = <T>(source: Iterable<T>): SyntheticIterator<T> => new ArrayIterator(source);

export function takeUnique<T>(source: Iterable<T>, selector: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const value of source) {
    const key = selector(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }

  return output;
}

export function sequenceState<T>(values: readonly T[]): ReadonlyArray<IterState<T>> {
  return values.map((value, index) => ({
    value,
    index,
    done: index >= values.length,
  }));
}

export const toIterator = <T>(source: Iterable<T>): SyntheticIterator<T> => asIterable(source);
