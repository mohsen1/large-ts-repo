export interface ZipIterator<TLeft, TRight> {
  left: Iterable<TLeft>;
  right: Iterable<TRight>;
}

export function* mapIterator<T, TOut>(
  values: Iterable<T>,
  mapper: (value: T, index: number) => TOut,
): IterableIterator<TOut> {
  let index = 0;
  for (const value of values) {
    yield mapper(value, index++);
  }
}

export function* filterIterator<T>(values: Iterable<T>, predicate: (value: T, index: number) => boolean): IterableIterator<T> {
  let index = 0;
  for (const value of values) {
    if (predicate(value, index++)) {
      yield value;
    }
  }
}

export function* takeIterator<T>(values: Iterable<T>, count: number): IterableIterator<T> {
  if (count <= 0) {
    return;
  }
  let remaining = count;
  for (const value of values) {
    if (remaining <= 0) {
      return;
    }
    remaining -= 1;
    yield value;
  }
}

export function* zipIterator<TLeft, TRight>({ left, right }: ZipIterator<TLeft, TRight>): IterableIterator<[TLeft, TRight]> {
  const leftIter = left[Symbol.iterator]();
  const rightIter = right[Symbol.iterator]();
  while (true) {
    const l = leftIter.next();
    const r = rightIter.next();
    if (l.done || r.done) {
      return;
    }
    yield [l.value, r.value];
  }
}

export async function* scanIterator<T, TAcc>(
  values: AsyncIterable<T>,
  seed: TAcc,
  reducer: (acc: TAcc, value: T, index: number) => Promise<TAcc>,
): AsyncIterableIterator<{ readonly index: number; readonly acc: TAcc }> {
  let state = seed;
  let index = 0;
  for await (const value of values) {
    state = await reducer(state, value, index);
    yield { index, acc: state };
    index += 1;
  }
}

export async function* mapAsyncIterator<T, TOut>(
  values: AsyncIterable<T>,
  mapper: (value: T, index: number) => Promise<TOut>,
): AsyncIterableIterator<TOut> {
  let index = 0;
  for await (const value of values) {
    yield await mapper(value, index++);
  }
}

export const collect = <T>(values: Iterable<T>): T[] => {
  return [...values];
};

export const toArray = <T>(values: Iterable<T>): T[] => collect(values);

export const chunkBy = <T>(values: Iterable<T>, size: number): T[][] => {
  if (size <= 0) {
    return [];
  }
  const output: T[][] = [];
  let bucket: T[] = [];
  for (const value of values) {
    bucket.push(value);
    if (bucket.length === size) {
      output.push(bucket);
      bucket = [];
    }
  }
  if (bucket.length) {
    output.push(bucket);
  }
  return output;
};

export const interleave = <A, B>(left: Iterable<A>, right: Iterable<B>): Array<A | B> => {
  const output: Array<A | B> = [];
  const l = left[Symbol.iterator]();
  const r = right[Symbol.iterator]();
  while (true) {
    const leftNext = l.next();
    const rightNext = r.next();
    if (!leftNext.done) {
      output.push(leftNext.value);
    }
    if (!rightNext.done) {
      output.push(rightNext.value);
    }
    if (leftNext.done && rightNext.done) {
      break;
    }
  }
  return output;
};

export async function collectAsync<T>(values: AsyncIterable<T>): Promise<T[]> {
  const output: T[] = [];
  for await (const value of values) {
    output.push(value);
  }
  return output;
}
