type Decrement<N extends number> = N extends 0
  ? never
  : N extends 1
    ? 0
    : N extends 2
      ? 1
      : N extends 3
        ? 2
        : N extends 4
          ? 3
          : N extends 5
            ? 4
            : never;

export type Prepend<Value, Tail extends readonly unknown[]> = readonly [Value, ...Tail];

export type TupleOfLength<TValue, Length extends number, Acc extends readonly unknown[] = []> =
  Acc['length'] extends Length
    ? Acc
    : TupleOfLength<TValue, Decrement<Length>, Prepend<TValue, Acc>>;

export const asIterator = <TValue>(items: Iterable<TValue>): IterableIterator<TValue> => {
  const iterator = items[Symbol.iterator]();
  const iterable: IterableIterator<TValue> = {
    [Symbol.iterator]: () => iterable,
    next: (value?: unknown) => iterator.next(value as never),
  };
  return iterable;
};

export const collect = <TValue>(iterator: IterableIterator<TValue>): readonly TValue[] => {
  const values: TValue[] = [];
  for (const value of iterator) {
    values.push(value);
  }
  return values;
};

export const mapArray = <
  TValue extends readonly unknown[],
  const TMapper extends (value: TValue[number], index: number) => string,
>(values: TValue, mapper: TMapper): { [K in keyof TValue]: string } => {
  const next = values.map((entry, index) => mapper(entry, index));
  return next as { [K in keyof TValue]: string };
};

export const chunk = <TValue>(values: readonly TValue[], size: number): readonly (readonly TValue[])[] => {
  const output: TValue[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
};

export const flattenTuple = <
  const TInput extends readonly unknown[],
>(values: TInput): readonly unknown[] => {
  return values.flat(Infinity);
};

export const flattenPair = <
  const TLeft extends readonly string[],
  const TRight extends readonly string[],
>(left: TLeft, right: TRight): readonly [...TLeft, ...TRight] => {
  return [...left, ...right] as readonly [...TLeft, ...TRight];
};

export const consumeAsync = async <TValue>(
  source: AsyncIterable<TValue>,
  limit: number,
): Promise<readonly TValue[]> => {
  const out: TValue[] = [];
  for await (const value of source) {
    out.push(value);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
};
