import type { JsonValue } from '@shared/type-level';

export const sortByWeight = <TItem, TWeight extends (item: TItem) => number>(
  items: readonly TItem[],
  getWeight: TWeight,
): readonly TItem[] => [...items].toSorted((left, right) => {
  const leftWeight = getWeight(left);
  const rightWeight = getWeight(right);
  return rightWeight - leftWeight;
});

export const mergeRecords = <TLeft extends Record<string, JsonValue>, TRight extends Record<string, JsonValue>>(
  left: TLeft,
  right: TRight,
): TLeft & Omit<TRight, keyof TLeft> => ({
  ...left,
  ...right,
});

export const projectKeys = <TRecord extends Record<string, JsonValue>, const TKeys extends readonly (keyof TRecord)[]>(
  record: TRecord,
  keys: TKeys,
): Pick<TRecord, TKeys[number]> => {
  const output = {} as Pick<TRecord, TKeys[number]>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      output[key] = record[key];
    }
  }
  return output;
};

export const remapKeys = <TRecord extends Record<string, JsonValue>, TPrefix extends string>(
  record: TRecord,
  prefix: TPrefix,
): { [K in keyof TRecord as `${TPrefix}:${Extract<K, string>}`]: TRecord[K] } => {
  const output = {} as { [K in keyof TRecord as `${TPrefix}:${Extract<K, string>}`]: TRecord[K] };
  type Remapped = typeof output;
  for (const [key, value] of Object.entries(record) as Array<[keyof TRecord & string, JsonValue]>) {
    if (value === null) {
      continue;
    }
    const mapped = `${prefix}:${key}` as keyof Remapped;
    output[mapped] = value as unknown as Remapped[keyof Remapped];
  }
  return output;
};

type HeadTail<TValues extends readonly unknown[]> = TValues extends readonly [any, ...infer Rest] ? Rest : readonly [];

export const inferHeadTail = <TValues extends readonly unknown[]>(
  values: TValues,
): { head: TValues[0] | undefined; tail: HeadTail<TValues> } => {
  if (values.length === 0) {
    const tail = [] as unknown as HeadTail<TValues>;
    return { head: undefined, tail };
  }
  const [head, ...tail] = values as unknown as [TValues[0], ...HeadTail<TValues>];
  return {
    head,
    tail: tail as HeadTail<TValues>,
  };
};

export const zipWithMetadata = <TLeft extends ReadonlyArray<JsonValue>, TRight extends ReadonlyArray<JsonValue>>(
  left: TLeft,
  right: TRight,
): Array<{ readonly left: TLeft[number]; readonly right: TRight[number] }> =>
  left.map((value, index) => ({
    left: value,
    right: right[index] as TRight[number],
  }));

export const chunkify = <TValue>(values: readonly TValue[], size: number): readonly TValue[][] => {
  if (size <= 0) {
    return [[]];
  }
  const output: TValue[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push([...values.slice(index, index + size)]);
  }
  return output;
};

export const asReadonlyTuple = <TValue extends readonly unknown[]>(values: TValue): Readonly<TValue> => values;

export const flattenEntries = <TValue>(payload: readonly TValue[]): TValue[] => payload.flatMap((value) => [value]);

export const normalizeValue = <TValue>(value: TValue): string => JSON.stringify(value);

export const toCsv = (values: readonly string[]): string => values.join(',');
