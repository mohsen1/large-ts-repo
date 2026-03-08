export const mapIterator = <T, U>(values: Iterable<T>, mapper: (value: T, index: number) => U): readonly U[] => {
  let index = 0;
  return Iterator.from(values)
    .map((value) => mapper(value, index++))
    .toArray();
};

export const filterIterator = <T, S extends T>(
  values: Iterable<T>,
  predicate: (value: T, index: number) => value is S,
): readonly S[] => {
  let index = 0;
  return Iterator.from(values)
    .filter((value): value is S => predicate(value, index++))
    .toArray();
};

export const takeIterator = <T>(values: Iterable<T>, count: number): readonly T[] =>
  Iterator.from(values).take(count).toArray();

export const sumIterator = (values: Iterable<number>): number => Iterator.from(values).reduce((total, value) => total + value, 0);

export const flatMapIterator = <T, U>(values: Iterable<T>, mapper: (value: T) => Iterable<U>): readonly U[] =>
  Iterator.from(values).flatMap(mapper).toArray();

export const firstIterator = <T>(values: Iterable<T>, predicate: (value: T) => boolean): T | undefined =>
  Iterator.from(values).find(predicate);
