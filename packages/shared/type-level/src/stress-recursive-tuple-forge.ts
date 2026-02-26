export type DecrementNumber<T extends number> = T extends 0
  ? never
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
                                      ? 15
                                      : T extends 19
                                        ? 18
                                        : T extends 20
                                          ? 19
                                          : never;

export type BuildTuple<TTarget extends number, TValue = unknown, Acc extends readonly TValue[] = []> =
  Acc['length'] extends TTarget
    ? Acc
    : BuildTuple<TTarget, TValue, [...Acc, TValue]>;

export type WrapDepthTuple<TInput, Depth extends number, Acc extends readonly unknown[] = []> =
  Acc['length'] extends Depth
    ? Acc
    : WrapDepthTuple<readonly [TInput], Depth, [...Acc, readonly [TInput]]>;

export type UnwrapDepthTuple<TTuple extends readonly unknown[]> =
  TTuple extends readonly [infer H, ...infer R]
    ? [H, ...UnwrapDepthTuple<R extends readonly unknown[] ? R : []>]
    : [];

export type RecursiveAccumulator<TSeed, Depth extends number, Acc extends readonly TSeed[] = []> =
  Depth extends 0
    ? Acc
    : Acc['length'] extends Depth
      ? Acc
      : RecursiveAccumulator<TSeed, DecrementNumber<Depth>, [...Acc, TSeed]>;

export type RecursiveStringify<T extends number, Acc extends string = ''> =
  T extends 0
    ? Acc
    : RecursiveStringify<
        DecrementNumber<T>,
        `${Acc}${Acc extends '' ? '' : '-'}${T}`
      >;

export type MutualA<T, N extends number> =
  N extends 0
    ? T
    : MutualB<
      {
        readonly value: T;
        readonly depth: N;
      },
      N
    >;

export type MutualB<T, N extends number> =
  N extends 0
    ? T
    : MutualC<T, DecrementNumber<N>>;

export type MutualC<T, N extends number> =
  N extends 0
    ? T
    : MutualA<{
      readonly value: T;
      readonly chain: MutualC<T, DecrementNumber<N>>;
    }, N>;

export type RecursiveCatalog<T extends string, Depth extends number> =
  Depth extends 0
    ? T
    : {
      readonly token: T;
      readonly nested: RecursiveCatalog<`${T}.${Depth}`, DecrementNumber<Depth>>;
      readonly trace: BuildTuple<4, T>;
    };

export type CatalogMatrix<T extends string, Depth extends number, TDepth extends readonly unknown[] = []> =
  TDepth['length'] extends Depth
    ? { readonly label: T; readonly path: RecursiveStringify<Depth>; }
    : {
      readonly label: T;
      readonly path: RecursiveStringify<TDepth['length']>;
      readonly inner: CatalogMatrix<`${T}-${TDepth['length']}`, Depth, [...TDepth, unknown]>;
    };

export const buildCatalogTuple = <N extends number>(size: N): BuildTuple<N, string> => {
  return Array.from({ length: size }, (_v, index) => `node-${index}`) as BuildTuple<N, string>;
};

export const buildWrappedTuple = <N extends number>(size: N): WrapDepthTuple<string, N> => {
  return Array.from({ length: size }, () => ['payload']) as WrapDepthTuple<string, N>;
};

export type BundleResolver<T extends readonly string[]> = {
  readonly values: { [K in keyof T]: T[K] };
};

export type RouteProjection<T extends string> = {
  readonly route: T;
  readonly kind: 'storm-route';
  readonly node: string;
};

export const expandRecursiveState = <T, N extends number>(seed: T, depth: N): RecursiveAccumulator<T, N> => {
  const output: T[] = [];
  for (let index = 0; index < depth; index += 1) {
    output.push(seed);
  }
  return output as RecursiveAccumulator<T, N>;
};

export const stringifyAccumulation = <N extends number>(size: N): RecursiveStringify<N> => {
  const output = Array.from({ length: size }, (_v, index) => String(index)).join('-');
  return output as RecursiveStringify<N>;
};

export const makeCatalogGrid = <T extends string>(seed: T) => {
  const rows = buildCatalogTuple(10);
  const wrapped = buildWrappedTuple(4);
  const flattened = rows.flatMap((row) => [row, row]);

  return {
    seed,
    rows,
    wrapped,
    flattened,
    signature: stringifyAccumulation(wrapped.length),
    recursive: {} as RecursiveCatalog<T, 6>,
    matrix: {} as CatalogMatrix<T, 6>,
    chain: {} as MutualA<T, 8>,
  };
};

export type CatalogBuilderState = ReturnType<typeof makeCatalogGrid<string>>;

export const catalogCatalog = [
  makeCatalogGrid('incident'),
  makeCatalogGrid('workload'),
  makeCatalogGrid('policy'),
] as const;
