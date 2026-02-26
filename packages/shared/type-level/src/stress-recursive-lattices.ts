export type Decrement<T extends number> =
  T extends 0
    ? 0
    : T extends 1
      ? 0
      : T extends 2
        ? 1
        : T extends 3
          ? 2
          : T extends 4
            ? 3
            : T extends 5
              ? 4
              : T extends 6
                ? 5
                : T extends 7
                  ? 6
                  : T extends 8
                    ? 7
                    : T extends 9
                      ? 8
                      : T extends 10
                        ? 9
                        : T extends 11
                          ? 10
                          : T extends 12
                            ? 11
                            : T extends 13
                              ? 12
                              : T extends 14
                                ? 13
                                : T extends 15
                                  ? 14
                                  : T extends 16
                                    ? 15
                                    : T extends 17
                                      ? 16
                                      : T extends 18
                                        ? 17
                                        : T extends 19
                                          ? 18
                                          : T extends 20
                                            ? 19
                                            : T extends 21
                                              ? 20
                                              : T extends 22
                                                ? 21
                                                : T extends 23
                                                  ? 22
                                                  : T extends 24
                                                    ? 23
                                                    : T extends 25
                                                      ? 24
                                                      : T extends 26
                                                        ? 25
                                                        : T extends 27
                                                          ? 26
                                                          : T extends 28
                                                            ? 27
                                                            : T extends 29
                                                              ? 28
                                                              : T extends 30
                                                                ? 29
                                                                : T extends 31
                                                                  ? 30
                                                                  : T extends 32
                                                                    ? 31
                                                                    : T extends 33
                                                                      ? 32
                                                                      : T extends 34
                                                                        ? 33
                                                                        : T extends 35
                                                                          ? 34
                                                                          : T extends 36
                                                                            ? 35
                                                                            : T extends 37
                                                                              ? 36
                                                                              : T extends 38
                                                                                ? 37
                                                                                : T extends 39
                                                                                  ? 38
                                                                                  : T extends 40
                                                                                    ? 39
                                                                                    : number;

export type BuildTuple<Target extends number, Acc extends unknown[] = []> =
  Acc['length'] extends Target
    ? Acc
    : BuildTuple<Target, [...Acc, Acc['length']]>
;

export type TupleSum<T extends readonly unknown[]> =
  T extends [infer Head, ...infer Tail]
    ? Head extends number
      ? Head | TupleSum<Tail>
      : TupleSum<Tail>
    : never;

export type PushUnknown<T extends unknown[]> = [...T, unknown];

export type RecWrap<T> = {
  readonly inner: T;
  readonly depth: number;
};

export type DeepWrap<T, Depth extends number> = Depth extends 0
  ? T
  : RecWrap<DeepWrap<T, Decrement<Depth>>>;

export type ReduceDepth<T, Depth extends number, Bag extends unknown[] = []> = Depth extends 0
  ? { value: T; path: Bag }
  : DeepPath<T, Decrement<Depth>, [...Bag, Depth]>;

export type DeepPath<T, Depth extends number, Bag extends unknown[]> = {
  readonly value: T;
  readonly path: Bag;
} & (Depth extends 0
  ? { readonly terminal: true }
  : {
      readonly nested: DeepPath<T, Decrement<Depth>, [...Bag, Depth]>;
    });

export type Accumulate<T, Depth extends number> =
  Depth extends 0
    ? [T]
    : [T, ...Accumulate<DeepWrap<T, Decrement<Depth>>, Decrement<Depth>>];

export type MutualEven<T, Depth extends number> =
  Depth extends 0
    ? T
    : T extends ReadonlyArray<infer U>
      ? MutualOdd<U, Decrement<Depth>>[]
      : { value: T; next: MutualOdd<T, Decrement<Depth>> };

export type MutualOdd<T, Depth extends number> =
  Depth extends 0
    ? T
    : T extends ReadonlyArray<infer U>
      ? { value: U; next: MutualEven<U, Decrement<Depth>>[] }
      : { value: T; next: MutualEven<T, Decrement<Depth>> };

export type DeepSolverState<T, Depth extends number> =
  Depth extends 0
    ? T
    : MutualEven<T, Depth> & { __depth: Depth };

export type DeepSolverMatrix<T, Depth extends number> = ReduceDepth<T, Depth>;

export const recursiveTupleSeed = [...Array(20).keys()] as BuildTuple<20>;

export type BuiltTupleLength = typeof recursiveTupleSeed['length'];

export const recursiveBuilder = <T extends number>(n: T): BuildTuple<T> => {
  const items: unknown[] = [];
  let index = 0;
  while (index < n) {
    items.push(index);
    index += 1;
  }
  return items as BuildTuple<T>;
};

export const resolveRecursiveDepth = <T, N extends number>(
  value: T,
  depth: N,
): DeepSolverState<T, N> => {
  return {
    value,
    next: depth > 0 ? (value as unknown as T) : value,
    __depth: depth,
  } as DeepSolverState<T, N>;
};

export const accumulateSolver = <T, N extends number>(value: T, depth: N): Accumulate<T, N> => {
  const tuple: unknown[] = [];
  let cursor = 0;
  const max = Number(depth);
  let current: unknown = value;
  while (cursor <= max) {
    tuple.push(current);
    current = { current, cursor, marker: `step-${cursor}` };
    cursor += 1;
  }
  return tuple as Accumulate<T, N>;
};

export const deepMutualChain = <T, N extends number>(value: T, depth: N): MutualEven<T, N> => {
  const seen: unknown[] = [value];
  const terminal = depth <= 0;
  if (terminal) {
    return { value, next: value as any } as MutualEven<T, N>;
  }
  let current = value as unknown as MutualEven<T, N>;
  for (let i = 0; i < Number(depth); i += 1) {
    current = { value: current, next: [current] } as MutualEven<T, N>;
  }
  return current;
};
