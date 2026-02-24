export type AsyncLikeIterable<T> = Iterable<T> | AsyncIterable<T>;
export type AsyncLikeIterator<T> = Iterator<T> | AsyncIterator<T>;
export type Awaitable<T> = T | Promise<T>;

const defaults = {
  concurrency: 4,
  chunkSize: 8,
};

export const DEFAULT_CONCURRENCY = defaults.concurrency;
export const DEFAULT_CHUNK_SIZE = defaults.chunkSize;

export type Chunk<T> = readonly T[] & {
  readonly __chunk: unique symbol;
};

const asChunk = <T>(values: readonly T[]): Chunk<T> => {
  return values as Chunk<T>;
};

const asIndexTuple = <T>(value: readonly [number, T]): [number, T] => [value[0], value[1]];

export const toAsyncIterable = async function* <T>(source: AsyncLikeIterable<T>): AsyncGenerator<T, void, void> {
  if (Symbol.asyncIterator in Object(source)) {
    for await (const value of source as AsyncIterable<T>) {
      yield value;
    }
    return;
  }

  for (const value of source as Iterable<T>) {
    yield value;
  }
};

export const mapAsync = async function* <TInput, TOutput>(
  source: AsyncLikeIterable<TInput>,
  mapper: (value: TInput, index: number) => Awaitable<TOutput>,
): AsyncGenerator<TOutput, void, void> {
  let index = 0;
  for await (const value of source) {
    yield await mapper(value, index);
    index += 1;
  }
};

export const filterAsync = async function* <TInput>(
  source: AsyncLikeIterable<TInput>,
  predicate: (value: TInput, index: number) => Awaitable<boolean>,
): AsyncGenerator<TInput, void, void> {
  let index = 0;
  for await (const value of source) {
    if (await predicate(value, index)) {
      yield value;
    }
    index += 1;
  }
};

export const reduceAsync = async <TInput, TAccumulator>(
  source: AsyncLikeIterable<TInput>,
  reducer: (acc: TAccumulator, value: TInput, index: number) => Awaitable<TAccumulator>,
  seed: TAccumulator,
): Promise<TAccumulator> => {
  let index = 0;
  let accumulator = seed;
  for await (const value of source) {
    accumulator = await reducer(accumulator, value, index);
    index += 1;
  }
  return accumulator;
};

export const collectArray = async <TInput>(source: AsyncLikeIterable<TInput>): Promise<readonly TInput[]> => {
  const output: TInput[] = [];
  for await (const value of source) {
    output.push(value);
  }
  return output;
};

export const takeAsync = async function* <T>(
  source: AsyncLikeIterable<T>,
  limit: number,
): AsyncGenerator<T, void, void> {
  let count = 0;
  const max = Math.max(0, Math.floor(limit));
  if (max <= 0) {
    return;
  }
  for await (const value of source) {
    if (count >= max) {
      return;
    }
    yield value;
    count += 1;
  }
};

export const chunkAsync = async function* <T>(
  source: AsyncLikeIterable<T>,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): AsyncGenerator<Chunk<T>, void, void> {
  const queue: T[] = [];
  for await (const value of source) {
    queue.push(value);
    if (queue.length < Math.max(1, chunkSize)) {
      continue;
    }
    yield asChunk(queue.splice(0, chunkSize));
  }
  if (queue.length > 0) {
    yield asChunk(queue.splice(0));
  }
};

export const zipAsync = async function* <TLeft, TRight>(
  left: AsyncLikeIterable<TLeft>,
  right: AsyncLikeIterable<TRight>,
): AsyncGenerator<readonly [TLeft, TRight], void, void> {
  const leftIterator = toAsyncIterable(left)[Symbol.asyncIterator]();
  const rightIterator = toAsyncIterable(right)[Symbol.asyncIterator]();

  while (true) {
    const [l, r] = await Promise.all([leftIterator.next(), rightIterator.next()]);
    if (l.done || r.done || l.value === undefined || r.value === undefined) {
      return;
    }
    yield [l.value, r.value];
  }
};

export const parallelMapAsync = async <TInput, TOutput>(
  source: AsyncLikeIterable<TInput>,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<readonly TOutput[]> => {
  const limit = Math.max(1, Math.floor(concurrency));
  const values = await collectArray(source);
  const output: TOutput[] = [];

  for (let offset = 0; offset < values.length; offset += limit) {
    const batch = values.slice(offset, offset + limit);
    const mapped = await Promise.all(batch.map((value, index) => mapper(value, offset + index)));
    output.push(...mapped);
  }
  return output;
};

export const partitionBy = <TValue, TKey extends string>(
  values: readonly TValue[],
  selector: (value: TValue, index: number) => TKey,
): ReadonlyMap<TKey, readonly TValue[]> => {
  const buckets = new Map<TKey, TValue[]>();
  values.forEach((value, index) => {
    const key = selector(value, index);
    const bucket = buckets.get(key) ?? [];
    bucket.push(value);
    buckets.set(key, bucket);
  });
  return new Map(Array.from(buckets.entries()).map(([key, list]) => [key, list]));
};

export const toMap = <TValue, TKey extends string>(
  values: readonly TValue[],
  key: (value: TValue, index: number) => TKey,
): ReadonlyMap<TKey, TValue> => {
  const map = new Map<TKey, TValue>();
  values.forEach((entry, index) => {
    const mapKey = key(entry, index);
    map.set(mapKey, entry);
  });
  return map;
};

export const uniqueBy = <TValue, TKey>(
  values: readonly TValue[],
  key: (value: TValue) => TKey,
): readonly TValue[] => {
  const seen = new Set<TKey>();
  const output: TValue[] = [];
  for (const value of values) {
    const bucket = key(value);
    if (seen.has(bucket)) {
      continue;
    }
    seen.add(bucket);
    output.push(value);
  }
  return output;
};

export const enumerate = <TValue>(values: readonly TValue[]): readonly [number, TValue][] =>
  values.map((value, index) => asIndexTuple([index, value]));
