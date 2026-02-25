export const chunkIterator = <T>(items: Iterable<T>, size: number): IterableIterator<readonly T[]> => {
  const iterator = items[Symbol.iterator]();
  let buffer: T[] = [];

  return {
    [Symbol.iterator]() {
      return this;
    },
    next(): IteratorResult<readonly T[]> {
      while (true) {
        const result = iterator.next();
        if (result.done) {
          if (buffer.length === 0) {
            return { done: true, value: undefined };
          }
          const value = [...buffer] as const;
          buffer = [];
          return { done: false, value };
        }

        buffer.push(result.value);
        if (buffer.length === size) {
          const value = [...buffer] as const;
          buffer = [];
          return { done: false, value };
        }
      }
    },
  };
};

export const consumeIterator = async <T, TResult>(
  iterator: AsyncIterable<T>,
  reducer: (acc: TResult, value: T, index: number) => Promise<TResult>,
  seed: TResult,
): Promise<TResult> => {
  let index = 0;
  let acc = seed;
  for await (const value of iterator) {
    acc = await reducer(acc, value, index++);
  }
  return acc;
};

export const flattenAsync = async <T>(source: AsyncIterable<Iterable<T>>): Promise<T[]> => {
  const out: T[] = [];
  for await (const group of source) {
    for (const item of group) {
      out.push(item);
    }
  }
  return out;
};

export const toAsyncIterator = async function* <T>(items: Iterable<T>): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
};

export const collectAll = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const entry of items) {
    collected.push(entry);
  }
  return collected;
};

export const transpose = <T>(matrix: readonly (readonly T[])[]): readonly T[][] => {
  const rows = matrix.length;
  const cols = Math.max(0, ...matrix.map((row) => row.length));
  if (rows === 0 || cols === 0) {
    return [];
  }

  return Array.from({ length: cols }, (_unused, column) => {
    const values: T[] = [];
    for (const row of matrix) {
      const item = row[column];
      if (item !== undefined) {
        values.push(item);
      }
    }
    return values;
  });
};
