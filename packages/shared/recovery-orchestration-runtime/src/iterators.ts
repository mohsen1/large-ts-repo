import { NoInfer } from '@shared/type-level';

export type IteratorChunk<T> = readonly [T, ...T[]];
export type IteratorStep<T> = {
  readonly index: number;
  readonly value: T;
};

export const mapIterable = <T, U>(
  source: Iterable<T>,
  mapper: (value: T, index: number) => U,
): Generator<U, void, undefined> => {
  function* iterator() {
    let index = 0;
    for (const item of source) {
      yield mapper(item, index);
      index += 1;
    }
  }
  return iterator();
};

export const filterIterable = <T>(
  source: Iterable<T>,
  predicate: (value: T, index: number) => boolean,
): Generator<T, void, undefined> => {
  function* iterator() {
    let index = 0;
    for (const item of source) {
      if (predicate(item, index)) {
        yield item;
      }
      index += 1;
    }
  }
  return iterator();
};

export const zipIterables = <A, B>(
  left: Iterable<A>,
  right: Iterable<B>,
): Generator<[A, B], void, undefined> => {
  function* iterator() {
    const leftIter = left[Symbol.iterator]();
    const rightIter = right[Symbol.iterator]();
    while (true) {
      const leftStep = leftIter.next();
      const rightStep = rightIter.next();
      if (leftStep.done || rightStep.done) {
        return;
      }
      yield [leftStep.value, rightStep.value] as [A, B];
    }
  }
  return iterator();
};

export const collectIterable = <T>(values: Iterable<T>): readonly T[] => {
  const output: T[] = [];
  for (const value of values) {
    output.push(value);
  }
  return output;
};

export const chunkIterable = <T>(values: Iterable<T>, size: number): Generator<T[], void, undefined> => {
  function* iterator() {
    let bucket: T[] = [];
    for (const value of values) {
      bucket.push(value);
      if (bucket.length >= size) {
        yield bucket;
        bucket = [];
      }
    }
    if (bucket.length > 0) {
      yield bucket;
    }
  }
  return iterator();
};

export const mapAsyncIterable = async function* <T, U>(
  source: AsyncIterable<T>,
  mapper: (value: T, index: number) => U,
): AsyncGenerator<U, void, undefined> {
  let index = 0;
  for await (const value of source) {
    yield mapper(value, index);
    index += 1;
  }
};

export const collectAsyncIterable = async <T>(source: AsyncIterable<T>): Promise<readonly T[]> => {
  const output: T[] = [];
  for await (const value of source) {
    output.push(value);
  }
  return output;
};

export const toObjectEntries = <TValue>(
  source: Iterable<readonly [string, TValue]>,
): Record<string, TValue> => {
  const output: Record<string, TValue> = {};
  for (const [key, value] of source) {
    output[key] = value;
  }
  return output;
};

export const stepStream = <T>(
  source: Iterable<T>,
): Generator<IteratorStep<T>, void, undefined> => {
  function* iterator() {
    let index = 0;
    for (const value of source) {
      yield { index, value };
      index += 1;
    }
  }
  return iterator();
};

export const interleave = async function* <T, U>(
  left: AsyncIterable<T>,
  right: AsyncIterable<U>,
): AsyncGenerator<T | U, void, undefined> {
  const leftIterator = left[Symbol.asyncIterator]();
  const rightIterator = right[Symbol.asyncIterator]();
  while (true) {
    const [leftStep, rightStep] = await Promise.all([leftIterator.next(), rightIterator.next()]);
    if (leftStep.done && rightStep.done) {
      return;
    }
    if (!leftStep.done) {
      yield leftStep.value;
    }
    if (!rightStep.done) {
      yield rightStep.value;
    }
  }
};

export const flattenAsyncValues = async <T>(sources: AsyncIterable<Promise<T>>): Promise<readonly T[]> => {
  const values = await collectAsyncIterable(sources);
  return values as readonly T[];
};

export const pick = <T, K extends keyof T>(
  source: Iterable<T>,
  keys: readonly NoInfer<K>[],
): Generator<Pick<T, K>> => {
  function* iterator() {
    for (const value of source) {
      const output = {} as Pick<T, K>;
      for (const key of keys) {
        output[key] = value[key];
      }
      yield output;
    }
  }
  return iterator();
};
