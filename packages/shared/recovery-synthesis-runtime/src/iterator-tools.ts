import type { StageName } from './types';

export type AsyncSource<T> = AsyncIterable<T> | Iterable<T>;

export type EntryTuple<T extends readonly unknown[]> = {
  [K in keyof T]: [K & number, T[K] extends AsyncSource<infer U> ? Awaited<U> : T[K]];
}[number];

type ZipRow<T extends readonly Iterable<unknown>[]> = {
  [K in keyof T]: [K & number, T[K] extends Iterable<infer U> ? U : never];
}[number][];

export function collectIterable<T>(items: Iterable<T>): T[] {
  const out: T[] = [];
  for (const item of items) {
    out.push(item);
  }
  return out;
}

export async function collectAsyncIterable<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) {
    out.push(item);
  }
  return out;
}

export function* mapIterable<T, U>(items: Iterable<T>, fn: (item: T, index: number) => U): Generator<U> {
  let index = 0;
  for (const item of items) {
    yield fn(item, index);
    index += 1;
  }
}

export function* filterIterable<T>(items: Iterable<T>, predicate: (item: T) => boolean): Generator<T> {
  for (const item of items) {
    if (predicate(item)) {
      yield item;
    }
  }
}

export function* reducePairs<T>(items: Iterable<T>): Generator<[T, T]> {
  const iterator = items[Symbol.iterator]();
  for (let current = iterator.next(); !current.done; current = iterator.next()) {
    const next = iterator.next();
    if (!next.done) {
      yield [current.value, next.value];
      current = next;
    }
  }
}

export function* chunkBy<T>(items: Iterable<T>, size: number): Generator<T[]> {
  if (size < 1) {
    return;
  }

  let bucket: T[] = [];
  for (const item of items) {
    bucket.push(item);
    if (bucket.length === size) {
      yield bucket;
      bucket = [];
    }
  }

  if (bucket.length > 0) {
    yield bucket;
  }
}

export async function* asyncMap<T, U>(
  items: AsyncSource<T>,
  mapper: (item: T, stage: StageName, index: number) => Promise<U>,
): AsyncGenerator<U> {
  let index = 0;
  if (Symbol.asyncIterator in Object(items)) {
    for await (const item of items as AsyncIterable<T>) {
      yield await mapper(item, `stage:transform` as StageName, index);
      index += 1;
    }
  } else {
    for (const item of items as Iterable<T>) {
      yield await mapper(item, `stage:transform` as StageName, index);
      index += 1;
    }
  }
}

export function* zipN<T extends readonly Iterable<unknown>[]>(...items: T): Generator<ZipRow<T>, void, void> {
  const iterators = items.map((item) => item[Symbol.iterator]());

  while (true) {
    const values = iterators.map((iterator, index) => {
      const state = iterator.next();
      return {
        index,
        state,
      };
    });

    if (values.some((value) => value.state.done)) {
      return;
    }

    yield values.map((entry) => [entry.index, entry.state.value as unknown]) as ZipRow<T>;
  }
}
