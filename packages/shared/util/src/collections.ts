export const groupToMap = <T, const K>(
  values: Iterable<T>,
  selector: (value: T) => K,
): ReadonlyMap<K, readonly T[]> => Map.groupBy(Array.from(values), selector);

export const groupToRecord = <T, const K extends string>(
  values: Iterable<T>,
  selector: (value: T) => K,
): Partial<Record<K, readonly T[]>> => Object.groupBy(Array.from(values), selector) as Partial<Record<K, readonly T[]>>;

export const sortBy = <T>(values: readonly T[], selector: (value: T) => number): readonly T[] =>
  Array.from(values).toSorted((left, right) => selector(left) - selector(right));

export const reverseCopy = <T>(values: readonly T[]): readonly T[] => Array.from(values).toReversed();

export const replaceAt = <T>(values: readonly T[], index: number, value: T): readonly T[] =>
  Array.from(values).with(index, value);

export const removeAt = <T>(values: readonly T[], index: number): readonly T[] =>
  Array.from(values).toSpliced(index, 1);

export const uniqueBy = <T, const K>(values: readonly T[], selector: (value: T) => K): readonly T[] =>
  Array.from(Map.groupBy(values, selector).values(), ([first]) => first!).filter((value) => value !== undefined);
