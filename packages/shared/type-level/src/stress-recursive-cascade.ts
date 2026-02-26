import type { NoInferAdvanced } from './composition-labs';

export type BuildTuple<T, N extends number, TAcc extends readonly T[] = []> = N extends TAcc['length']
  ? TAcc
  : BuildTuple<T, N, readonly [...TAcc, T]>;

export type TupleLength<T extends readonly unknown[]> = T['length'];

export type Decrement<N extends number> = BuildTuple<unknown, N> extends readonly [infer _First, ...infer Rest]
  ? Rest['length']
  : never;

type DepthLane =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30;

type DepthPrev = {
  0: never;
  1: 0;
  2: 1;
  3: 2;
  4: 3;
  5: 4;
  6: 5;
  7: 6;
  8: 7;
  9: 8;
  10: 9;
  11: 10;
  12: 11;
  13: 12;
  14: 13;
  15: 14;
  16: 15;
  17: 16;
  18: 17;
  19: 18;
  20: 19;
  21: 20;
  22: 21;
  23: 22;
  24: 23;
  25: 24;
  26: 25;
  27: 26;
  28: 27;
  29: 28;
  30: 29;
};

type BoundedDecrement<N extends DepthLane> = DepthPrev[N];

export type Repeat<T, N extends number, TAcc extends readonly T[] = []> = N extends 0
  ? TAcc
  : Repeat<T, Decrement<N>, readonly [...TAcc, T]>;

export type TreeNode<TValue> = {
  readonly value: TValue;
  readonly children: readonly Tree<TValue>[];
};

export type Tree<TValue> = TreeNode<TValue> | TValue;

export type ExpandTree<T extends Tree<unknown>> = T extends TreeNode<infer TValue>
  ? { value: TValue; children: readonly ExpandTree<T['children'][number]>[] }
  : T;

export type Wrap<T> = {
  readonly wrapped: true;
  readonly value: T;
};

export type Unwrap<T> = T extends { readonly wrapped: true; readonly value: infer V } ? V : T;

export type Nest<T, N extends number> = N extends 0 ? T : Nest<Wrap<T>, Decrement<N>>;
export type FlattenNest<T> = T extends Wrap<infer U> ? FlattenNest<U> : T;

export type ResolveNest<T, N extends number> = FlattenNest<Nest<T, N>>;

export type BuildPath<
  TPrefix extends string,
  TDepth extends DepthLane,
  TAcc extends string = TPrefix,
> = TDepth extends 0
  ? TAcc
  : BuildPath<`${TPrefix}/${TDepth}`, BoundedDecrement<TDepth>, `${TAcc}/${TDepth}`>;

export type PathTokenize<T extends string> = T extends `${infer Head}/${infer Rest}`
  ? readonly [Head, ...PathTokenize<Rest>]
  : readonly [T];

export type PathReduce<
  TTokens extends readonly string[],
  TAcc extends string = '',
> = TTokens extends readonly [infer Head, ...infer Rest]
  ? Head extends string
    ? Rest extends readonly string[]
      ? PathReduce<Rest, `${TAcc}${TAcc extends '' ? '' : '.'}${Head}`>
      : TAcc
    : TAcc
  : TAcc;

export type ParsePath<T extends string> = PathReduce<PathTokenize<T>>;

export type ReverseTokens<T extends readonly string[]> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [...ReverseTokens<Rest extends readonly string[] ? Rest : []>, Head & string]
  : readonly [];

export type MergeTokens<
  A extends readonly string[],
  B extends readonly string[],
> = A extends readonly [infer AH, ...infer AR]
  ? B extends readonly [infer BH, ...infer BR]
    ? readonly [AH & string, BH & string, ...MergeTokens<AR extends readonly string[] ? AR : [], BR extends readonly string[] ? BR : []>]
    : readonly [AH & string, ...MergeTokens<AR extends readonly string[] ? AR : [], []>]
  : B extends readonly [infer BH, ...infer BR]
    ? readonly [BH & string, ...MergeTokens<[], BR extends readonly string[] ? BR : []>]
    : readonly [];

type ReversedPath<T extends string> = T extends `${infer Left}/${infer Right}` ? `${Right}/${Left}` : T;

export type RecursiveSolver<T extends string, TDepth extends DepthLane> = TDepth extends 0
  ? ParsePath<T>
  : ParsePath<ReversedPath<T>>;

export type MutualA<T, N extends DepthLane> = N extends 0
  ? { mode: 'leaf'; value: T }
  : MutualB<Wrap<T>, BoundedDecrement<N>>;

export type MutualB<T, N extends DepthLane> = N extends 0
  ? { mode: 'base'; value: T }
  : MutualA<Unwrap<T>, BoundedDecrement<N>>;

export type RecursiveTuple<T extends readonly unknown[], N extends DepthLane> = N extends 0
  ? T
  : RecursiveTuple<readonly [...T, ...T], BoundedDecrement<N>>;

export type RecursiveValue<
  T extends object,
  N extends DepthLane,
  Acc extends readonly unknown[] = readonly [],
> = N extends 0
  ? { readonly value: T; readonly chain: Acc }
  : RecursiveValue<{ readonly value: T }, BoundedDecrement<N>, readonly [...Acc, N]>;

export const buildCascade = <T extends object, N extends DepthLane>(
  value: T,
  depth: N,
): RecursiveValue<T, N> => {
  const payload = { value, chain: [] } as unknown as RecursiveValue<T, N>;
  void depth;
  return payload;
};

export const repeatTokens = <T extends string>(base: T, depth: number): string[] => {
  let current = base as string;
  const out = ['seed'];
  for (let index = 0; index < depth; index += 1) {
    current = `${current}/${String(index)}`;
    out.push(current);
  }
  return out;
};

export const expandTupleRecursively = (base: number, rounds: number): unknown[] => {
  let values = [base];
  for (let round = 0; round < rounds; round += 1) {
    values = values.concat(values.map((entry, index) => entry + index + round));
  }
  return values;
};

export type DeepSolverInput<T extends object, N extends DepthLane> = N extends 0
  ? T
  : DeepSolverInput<MutualA<T, N>, BoundedDecrement<N>>;

export type DeepSolverOutput<T extends object, N extends DepthLane> = DeepSolverInput<T, N> extends infer R
  ? {
      readonly ok: true;
      readonly result: R;
      readonly depth: N;
    }
  : never;

export type RouteBranch<N extends DepthLane> = BuildPath<'/orchestrate', N>;

export const nestedSolver = <T extends object>(value: T): DeepSolverOutput<T, 4> => {
  const resolved = { ok: true, result: value, depth: 4 as 4 } as DeepSolverOutput<T, 4>;
  return resolved;
};

export type BuildBundle<
  T,
  TDepth extends DepthLane,
  TPaths extends readonly string[] = [],
> = TDepth extends 0
  ? { value: T; paths: TPaths }
  : BuildBundle<MutualA<T, TDepth>, BoundedDecrement<TDepth>, readonly [...TPaths, `depth-${TDepth}`]>;

export const composeCascade = <T, N extends DepthLane>(seed: T, depth: N): BuildBundle<T, N> =>
  ({
    value: seed,
    paths: repeatTokens('root', Number(depth)),
  }) as BuildBundle<T, N>;

export type RecursiveMatrix<
  T extends readonly unknown[],
  Ctx extends DepthLane,
> = Ctx extends 0 ? T : RecursiveMatrix<readonly [...T, ...T], BoundedDecrement<Ctx>>;

export type CascadeIndex<T extends readonly unknown[], N extends DepthLane> = {
  readonly values: RecursiveMatrix<T, N>;
  readonly cursor: N;
  readonly head: T[number] | undefined;
};

export const matrixCascade = <T extends readonly unknown[], N extends DepthLane>(
  values: T,
  depth: N,
): CascadeIndex<T, N> => ({
  values: values as RecursiveMatrix<T, N>,
  cursor: depth,
  head: values[0] as T[number] | undefined,
});

export type NoInferMatrix = NoInferAdvanced<readonly unknown[]>;

export type RecursionGraph<T extends NoInferMatrix, N extends DepthLane> = RecursiveMatrix<T, N>;
