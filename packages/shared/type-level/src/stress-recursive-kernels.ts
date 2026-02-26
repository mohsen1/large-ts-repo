export type TupleBuilder<Length extends number, T extends unknown[] = []> =
  T['length'] extends Length
    ? T
    : TupleBuilder<Length, [...T, unknown]>;

export type DecTuple<Length extends number> = Length extends 0
  ? 0
  : TupleBuilder<Length> extends [unknown, ...infer Rest]
    ? Rest['length']
    : 0;

export type WrapLayer<T> = {
  readonly wrapped: T;
};
export type UnwrapLayer<T> = T extends { wrapped: infer R } ? R : T;

export type RecursiveWrap<T, Depth extends number> = Depth extends 0
  ? T
  : WrapLayer<RecursiveWrap<T, DecTuple<Depth>>>;

export type RecursiveUnwrap<T, Depth extends number> = Depth extends 0
  ? T
  : RecursiveUnwrap<UnwrapLayer<T>, DecTuple<Depth>>;

export type RecursivePair<T, Depth extends number> =
  Depth extends 0
    ? readonly [T]
    : [RecursiveWrap<T, Depth>, ...RecursivePair<RecursiveUnwrap<T, Depth>, DecTuple<Depth>>];

export type EvenDepth<T, Depth extends number> = Depth extends 0
  ? T
  : OddDepth<RecursiveWrap<T, Depth>, DecTuple<Depth>>;

export type OddDepth<T, Depth extends number> = Depth extends 0
  ? T
  : EvenDepth<RecursiveUnwrap<T, Depth>, DecTuple<Depth>>;

export type AccumulatedLayers<T, Depth extends number, Out extends unknown[] = []> =
  Depth extends 0
    ? Out
    : [
        ...Out,
        {
          readonly index: Out['length'];
          readonly shape: T;
        },
        ...AccumulatedLayers<RecursiveWrap<T, Out['length']>, DecTuple<Depth>, [...Out, unknown]>,
      ];

export type TailRecusiveUnion<T, Depth extends number> = Depth extends 0
  ? T
  : T extends readonly [infer Head, ...infer Tail]
    ? [Head, ...TailRecusiveUnion<Tail & readonly unknown[], DecTuple<Depth>>]
    : EvenDepth<T, Depth>;

export const buildRecursiveMatrix = <T, Depth extends number>(value: T, depth: Depth): RecursivePair<T, Depth> => {
  const output: unknown[] = [];
  let current: unknown = value;
  for (let index = 0; index <= depth; index += 1) {
    output.push(current);
    if (index % 2 === 0) {
      current = {
        wrapped: current,
      };
    } else {
      current = (current as { wrapped: unknown }).wrapped;
    }
  }
  return output as RecursivePair<T, Depth>;
};

export const recursiveSum = (values: readonly number[], depth: number): number => {
  const work = [...values];
  const total = work.reduce((acc, value, index) => acc + (index <= depth ? value : 0), 0);
  if (depth <= 1) {
    return total;
  }
  return recursiveSum(values, depth - 1) + total;
};
