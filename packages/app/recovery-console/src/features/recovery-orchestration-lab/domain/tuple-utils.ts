export type Prepend<TItem, TTuple extends readonly unknown[]> = readonly [TItem, ...TTuple];

export type Tail<TTuple extends readonly unknown[]> = TTuple extends readonly [any, ...infer Rest]
  ? Rest
  : readonly [];

export type RecursiveLength<TTuple extends readonly unknown[]> = TTuple['length'];

export type ReverseTuple<TTuple extends readonly unknown[]> = TTuple extends readonly [infer Head, ...infer Rest]
  ? [...ReverseTuple<Rest & readonly unknown[]>, Head]
  : readonly [];

export type ZipTuples<
  TLeft extends readonly unknown[],
  TRight extends readonly unknown[],
> = TLeft extends readonly [infer LeftHead, ...infer LeftTail]
  ? TRight extends readonly [infer RightHead, ...infer RightTail]
    ? readonly [[LeftHead, RightHead], ...ZipTuples<LeftTail & readonly unknown[], RightTail & readonly unknown[]>]
    : readonly []
  : readonly [];

export type CartesianProduct<
  TLeft extends readonly unknown[],
  TRight extends readonly unknown[],
> = TLeft extends readonly [infer LeftHead, ...infer LeftTail]
  ? [...MapToTuple<LeftHead, TRight>, ...CartesianProduct<LeftTail, TRight>]
  : readonly [];

type MapToTuple<THead, TRight extends readonly unknown[]> = TRight extends readonly [infer RightHead, ...infer RightTail]
  ? readonly [[THead, RightHead], ...MapToTuple<THead, RightTail & readonly unknown[]>]
  : readonly [];

export type FlattenNestedTuples<TTuple extends readonly unknown[]> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly unknown[]
    ? [...FlattenNestedTuples<Head>, ...FlattenNestedTuples<Tail & readonly unknown[]>]
    : [Head, ...FlattenNestedTuples<Tail & readonly unknown[]>]
  : readonly [];

export type MergeTuples<TLeft extends readonly unknown[], TRight extends readonly unknown[]> = readonly [
  ...TLeft,
  ...TRight,
];

export type BuildPath<
  TParts extends readonly string[],
  TAcc extends string = '',
> = TParts extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? BuildPath<Tail & readonly string[], `${TAcc}${TAcc extends '' ? '' : '.'}${Head}`>
    : never
  : TAcc;

export type DistinctTuple<TTuple extends readonly string[]> = TTuple extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? readonly [Head, ...ExcludeFromTuple<Tail & readonly string[], Head>]
    : readonly []
  : readonly [];

type ExcludeFromTuple<TTuple extends readonly string[], TItem extends string> = TTuple extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends string
    ? [Head] extends [TItem]
      ? ExcludeFromTuple<Tail & readonly string[], TItem>
      : readonly [Head, ...ExcludeFromTuple<Tail & readonly string[], TItem>]
    : readonly []
  : readonly [];

export const asReadonlyTuple = <T extends readonly unknown[]>(value: [...T]) => value;
export const asTuple = <T>(value: readonly T[]): readonly T[] => value;

export const mapTuple = <TIn extends readonly unknown[], TOut>(input: TIn, mapper: (value: TIn[number], index: number) => TOut): readonly TOut[] =>
  input.map((entry, index) => mapper(entry, index));

export const pairwise = <T>(source: readonly T[]) => {
  const pairs: Array<readonly [T, T]> = [];
  for (let index = 1; index < source.length; index += 1) {
    pairs.push([source[index - 1], source[index]]);
  }
  return pairs;
};

export const chunkBy = <T>(source: readonly T[], size: number): readonly (readonly T[])[] => {
  const safeSize = Math.max(1, Math.trunc(size));
  const chunks: Array<T[]> = [];
  for (let start = 0; start < source.length; start += safeSize) {
    chunks.push(source.slice(start, start + safeSize));
  }
  return chunks;
};

export const toPath = (...parts: readonly string[]): string => parts.join('.');

export const zipValues = <TLeft extends readonly unknown[], TRight extends readonly unknown[]>(
  left: TLeft,
  right: TRight,
) => {
  const length = Math.min(left.length, right.length);
  const output: Array<readonly [TLeft[number], TRight[number]]> = [];
  for (let index = 0; index < length; index += 1) {
    output.push([left[index], right[index]]);
  }
  return output;
};

export const walkCartesianPairs = <TLeft extends readonly unknown[], TRight extends readonly unknown[]>(
  left: TLeft,
  right: TRight,
) => {
  const output: Array<readonly [unknown, unknown]> = [];
  for (const leftValue of left) {
    for (const rightValue of right) {
      output.push([leftValue, rightValue]);
  }
  }
  return output;
};
