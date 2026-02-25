export interface AsyncMapper<T, U> {
  (item: T): Promise<U> | U;
}

export interface AsyncReducer<T, A> {
  (accumulator: A, item: T, index: number): Promise<A> | A;
}

export const chunkArray = <T, N extends number>(items: readonly T[], size: N): T[][] => {
  const chunks: T[][] = [];
  if (size <= 0) return chunks;
  let cursor = 0;
  while (cursor < items.length) {
    chunks.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return chunks;
};

export function* mapIterator<T, U>(items: Iterable<T>, map: (value: T, index: number) => U): IterableIterator<U> {
  let index = 0;
  for (const item of items) {
    yield map(item, index++);
  }
}

export function* filterIterator<T>(items: Iterable<T>, predicate: (value: T, index: number) => boolean): IterableIterator<T> {
  let index = 0;
  for (const item of items) {
    if (predicate(item, index++)) {
      yield item;
    }
  }
}

export const toMap = <K, V>(entries: Iterable<readonly [K, V]>): Map<K, V> => new Map(entries);

export const pairwise = <T>(items: Iterable<T>): Array<[T, T]> => {
  const out: Array<[T, T]> = [];
  const iterator = items[Symbol.iterator]();
  let previous = iterator.next();
  let next = iterator.next();

  while (!previous.done && !next.done) {
    out.push([previous.value, next.value]);
    previous = next;
    next = iterator.next();
  }

  return out;
};

export const asyncReduce = async <T, A>(
  values: AsyncIterable<T>,
  reducer: AsyncReducer<T, A>,
  seed: A,
): Promise<A> => {
  let index = 0;
  let acc = seed;
  for await (const value of values) {
    acc = await reducer(acc, value, index++);
  }
  return acc;
};

export const drainAsync = async <T>(values: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const value of values) {
    out.push(value);
  }
  return out;
};

export const mergeBy = <T, K extends keyof T, S extends readonly Iterable<T>[]>(items: S, key: K): Map<T[K], T[]> => {
  const grouped = new Map<T[K], T[]>();
  for (const bucket of items) {
    for (const item of bucket) {
      const bucketValue = item[key];
      const existing = grouped.get(bucketValue) ?? [];
      grouped.set(bucketValue, [...existing, item]);
    }
  }
  return grouped;
};

export async function* windowAsync<T>(values: AsyncIterable<T>, windowMs: number): AsyncGenerator<readonly T[]> {
  let bucket: T[] = [];
  let deadline = performance.now() + windowMs;

  for await (const value of values) {
    bucket.push(value);
    if (performance.now() >= deadline) {
      yield [...bucket];
      bucket = [];
      deadline = performance.now() + windowMs;
    }
  }

  if (bucket.length > 0) {
    yield [...bucket];
  }
}

export const zipToMap = <T>(
  ...records: T[]
): Map<string, unknown[]> => {
  const entries: Array<[string, unknown[]]> = records.flatMap((record) =>
    Object.entries(record as Record<string, unknown>).map(
      ([key, value]) => [key, [value]] as [string, unknown[]],
    ),
  );
  return new Map(entries);
};

