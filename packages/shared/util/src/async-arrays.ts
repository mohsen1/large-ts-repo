export const fromAsyncValues = <T>(values: Iterable<T> | AsyncIterable<T>): Promise<readonly T[]> =>
  Array.fromAsync(values);

export const mapAsyncValues = async <T, U>(
  values: Iterable<T> | AsyncIterable<T>,
  mapper: (value: T, index: number) => U | PromiseLike<U>,
): Promise<readonly U[]> => {
  let index = 0;
  return Array.fromAsync(values, (value) => mapper(value, index++));
};

export const filterAsyncValues = async <T>(
  values: Iterable<T> | AsyncIterable<T>,
  predicate: (value: T, index: number) => boolean | PromiseLike<boolean>,
): Promise<readonly T[]> => {
  let index = 0;
  const decisions = await Array.fromAsync(values, async (value) => ({
    value,
    include: await Promise.try(() => predicate(value, index++)),
  }));
  return decisions.filter((entry) => entry.include).map((entry) => entry.value);
};

export const settleAsyncValues = <T>(values: Iterable<T | PromiseLike<T>> | AsyncIterable<T | PromiseLike<T>>) =>
  Array.fromAsync(values, (value) => Promise.try(() => value));
