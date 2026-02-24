export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Head<TTuple extends readonly unknown[]> = TTuple extends readonly [infer First, ...unknown[]]
  ? First
  : never;

export type Tail<TTuple extends readonly unknown[]> = TTuple extends readonly [unknown, ...infer Rest]
  ? Rest
  : readonly [];

export type Prepend<TValue, TTuple extends readonly unknown[]> = readonly [TValue, ...TTuple];

export type Reverse<TTuple extends readonly unknown[], TOutput extends readonly unknown[] = readonly []> = TTuple extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Reverse<Tail, readonly [Head, ...TOutput]>
  : TOutput;

export type Zip<
  TLeft extends readonly unknown[],
  TRight extends readonly unknown[],
  TOutput extends readonly [unknown, unknown][] = readonly [],
> = TLeft extends readonly [infer LHead, ...infer LTail]
  ? TRight extends readonly [infer RHead, ...infer RTail]
    ? Zip<LTail, RTail, readonly [...TOutput, [LHead, RHead]]>
    : TOutput
  : TOutput;

export type CartesianProduct<
  TLeft extends readonly unknown[],
  TRight extends readonly unknown[],
> = {
  [LIndex in keyof TLeft]: {
    [RIndex in keyof TRight]: readonly [TLeft[LIndex], TRight[RIndex]];
  };
}[number][number];

export type TupleJoin<
  TTuple extends readonly string[],
  TDelimiter extends string,
  TOutput extends string = '',
> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends readonly string[]
      ? Tail['length'] extends 0
        ? `${TOutput}${Head}`
        : TupleJoin<Tail, TDelimiter, `${TOutput}${Head}${TDelimiter}`>
      : `${TOutput}${Head}`
    : TOutput
  : TOutput;

export type Take<
  TTuple extends readonly unknown[],
  TCount extends number,
  TOutput extends readonly unknown[] = readonly [],
> = TCount extends 0
  ? TOutput
  : TTuple extends readonly [infer Head, ...infer Tail]
    ? Take<Tail, Dec<TCount>, readonly [...TOutput, Head]>
    : TOutput;

export type Drop<
  TTuple extends readonly unknown[],
  TCount extends number,
> = TCount extends 0
  ? TTuple
  : TTuple extends readonly [unknown, ...infer Tail]
    ? Drop<Tail, Dec<TCount>>
    : readonly [];

type BuildCounter<TCount extends number, TTuple extends readonly unknown[] = []> = TTuple['length'] extends TCount
  ? TTuple
  : BuildCounter<TCount, readonly [unknown, ...TTuple]>;

export type Dec<TCount extends number> = BuildCounter<TCount> extends readonly [unknown, ...infer Rest]
  ? Rest['length']
  : never;

export type Repeat<TValue, TCount extends number> = TCount extends 0
  ? readonly []
  : readonly [TValue, ...Repeat<TValue, Dec<TCount>>];

export type NestedArrayFlatten<TTuple extends readonly unknown[]> = TTuple extends readonly [
  infer Head extends unknown[],
  ...infer Tail,
]
  ? [...Head, ...NestedArrayFlatten<Tail>]
  : TTuple extends readonly [infer Head, ...infer Tail]
    ? [Head, ...NestedArrayFlatten<Tail>]
    : readonly [];

export const head = <TValue>(tuple: readonly TValue[]): TValue | undefined => tuple[0];

export const tail = <TValue>(tuple: readonly TValue[]): TValue[] => [...tuple].slice(1);

export const reverseTuple = <TValue>(values: readonly TValue[]) => [...values].reverse() as readonly TValue[];

export const zip = <TLeft extends readonly unknown[], TRight extends readonly unknown[]>(
  left: TLeft,
  right: TRight,
): Zip<TLeft, TRight> => {
  const output: [unknown, unknown][] = [];
  const max = Math.min(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    output.push([left[index], right[index]]);
  }
  return output as unknown as Zip<TLeft, TRight>;
};

export const tupleJoin = <TTuple extends readonly string[], TDelimiter extends string>(values: TTuple, delimiter: TDelimiter) => {
  let output = '';
  for (const value of values) {
    if (output.length > 0) {
      output += delimiter;
    }
    output += value;
  }
  return output as TupleJoin<TTuple, TDelimiter>;
};

export const asTuple = <TValue>(values: readonly TValue[]): readonly [TValue, ...TValue[]] => {
  if (values.length === 0) {
    throw new Error('Expected at least one tuple entry');
  }
  return values as readonly [TValue, ...TValue[]];
};

export const take = <TTuple extends readonly unknown[], TCount extends number>(values: TTuple, count: TCount) => {
  const cap = Math.max(0, Math.min(values.length, count));
  return (values.slice(0, cap) as unknown) as Take<TTuple, TCount>;
};
