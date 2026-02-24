export type IteratorStep<T> = {
  readonly index: number;
  readonly value: T;
};

export const toIterableIterator = <T>(input: Iterable<T>): IterableIterator<T> => {
  return input[Symbol.iterator]() as IterableIterator<T>;
};

export const isIterable = <T>(value: unknown): value is Iterable<T> => {
  return value !== null && value !== undefined && typeof (value as Iterable<T>)[Symbol.iterator] === 'function';
};

export const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> => {
  return value !== null && value !== undefined && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
};

export function* mapIterable<T, R>(input: Iterable<T>, mapper: (value: T, index: number) => R): IterableIterator<R> {
  const iterator = toIterableIterator(input);
  let index = 0;
  while (true) {
    const entry = iterator.next();
    if (entry.done) {
      return;
    }
    yield mapper(entry.value, index++);
  }
}

export function* filterIterable<T>(input: Iterable<T>, predicate: (value: T, index: number) => boolean): IterableIterator<T> {
  const iterator = toIterableIterator(input);
  let index = 0;
  while (true) {
    const entry = iterator.next();
    if (entry.done) {
      return;
    }
    if (predicate(entry.value, index++)) {
      yield entry.value;
    }
  }
}

export const chunkIterable = <T>(input: Iterable<T>, size: number): IterableIterator<readonly T[]> => {
  return (function* () {
    const chunk: T[] = [];
    for (const value of toIterableIterator(input)) {
      chunk.push(value);
      if (chunk.length === size) {
        yield chunk.splice(0);
      }
    }
    if (chunk.length > 0) {
      yield chunk;
    }
  })();
};

export const collectIterable = <T>(input: Iterable<T>): T[] => {
  const items: T[] = [];
  for (const value of input) {
    items.push(value);
  }
  return items;
};

export const collectAsyncIterable = async <T>(input: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const value of input) {
    items.push(value);
  }
  return items;
};

export const reduceAsyncIterable = async <T, S>(
  input: AsyncIterable<T>,
  seed: S,
  reducer: (state: S, value: T, index: number) => Promise<S>,
): Promise<S> => {
  let state = seed;
  let index = 0;
  for await (const value of input) {
    state = await reducer(state, value, index++);
  }
  return state;
};

export const pairwise = <T>(input: Iterable<T>): IterableIterator<[T, T]> => {
  return (function* () {
    const iterator = toIterableIterator(input);
    let previous: T | null = null;
    let hasPrevious = false;
    for (const next of iterator) {
      if (hasPrevious) {
        yield [previous as T, next];
      }
      previous = next;
      hasPrevious = true;
    }
  })();
};

export const buildIteratorFingerprint = <T>(input: Iterable<T>): string => {
  const entries = collectIterable(input);
  const value = entries
    .map((entry) => (typeof entry === 'object' && entry !== null ? JSON.stringify(entry) : String(entry)))
    .join('|');
  return `${entries.length}:${value.slice(0, 140)}`;
};

export const zipLongest = <A extends readonly unknown[], B extends readonly unknown[]>(
  left: A,
  right: B,
): IterableIterator<[A[number], B[number]]> => {
  return (function* () {
    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max; index++) {
      yield [left[index] as A[number], right[index] as B[number]];
    }
  })();
};
