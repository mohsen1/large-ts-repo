export type NoInfer<T> = [T][T extends never ? 1 : 0];

export type BuildTuple<Length extends number, Output extends unknown[] = []> = Output['length'] extends Length
  ? Output
  : BuildTuple<Length, [...Output, unknown]>;

export type Dec<N extends number> = BuildTuple<N> extends [
  ...infer Prefix,
  unknown,
]
  ? Prefix['length']
  : 0;

export type Wrap<T> = { readonly value: T; readonly wrapped: true };

export type SolverState<TData, TStack extends readonly unknown[] = []> = {
  readonly data: TData;
  readonly stack: TStack;
  readonly checksum: TStack['length'];
};

export type MutateInput<TData> = TData extends string ? `${TData}-muted` : `seed-${string}`;

export type SolverPath<TState, Depth extends number> = Depth extends 0
  ? [TState]
  : TState extends { readonly data: infer Data; readonly stack: infer Stack }
    ? Stack extends readonly unknown[]
      ? [TState, ...SolverPath<SolverState<MutateInput<Data>, [...Stack, MutateInput<Data>]>, Dec<Depth>>]
      : [TState]
    : never;

export type SolverPipeline<TSeed extends string, D extends number = 12> = SolverPath<SolverState<TSeed>, D>;
export type BuildSolverChain<TSeed extends string> = ReadonlyArray<SolverState<TSeed>>;

export type DepthAwareRoute<T extends string, D extends number = 0> = D extends 0 ? `leaf:${T}` : `depth:${D}:${T}`;

export type MutalGrid<T extends string, D extends number> =
  | T
  | [`${T}-a`, `a${D}`, [MutateInput<T>, `b${D}`, MutateInput<T>]];

export type MutualA<T extends string, D extends number> = MutalGrid<T, D>;
export type MutualB<T extends string, D extends number> = MutalGrid<T, D>;
export type MutualC<T extends string, D extends number> = MutalGrid<T, D>;

export type ConditionalRecursion<T extends string, D extends number> = D extends 0
  ? T
  : T extends `${infer Prefix}-${infer Rest}`
    ? DepthAwareRoute<`${Prefix}:${Rest}`, D> | ConditionalRecursion<`${Prefix}#${Rest}`, Dec<D>>
    : DepthAwareRoute<T, D>;

export type RecursionResultUnion<T extends string, D extends number> =
  | ConditionalRecursion<T, D>
  | MutalGrid<T, D>
  | SolverPath<SolverState<T>, 3>[number];

export type SolverMatrix<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends string ? RecursionResultUnion<T[K], 5> : never;
};

export interface SolverProbeInput {
  readonly route: string;
  readonly depth: number;
  readonly payload?: unknown;
}

export const normalizeDepth = (depth: number): number => {
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(depth, 24));
};

export const parseRoute = <T extends string>(route: T): DepthAwareRoute<T, 6> => {
  return `leaf:${route}` as DepthAwareRoute<T, 6>;
};

export const solveRecursiveRoute = <TSeed extends string>(seed: TSeed, depth: number): ReadonlyArray<string> => {
  const safeDepth = normalizeDepth(Number(depth));
  const trail: string[] = [];
  let current: string = seed;

  for (let index = 0; index < safeDepth; index += 1) {
    trail.push(`${current}:${index}`);
    current = `${current}/${index}`;
  }

  return trail;
};

export const recursiveSolverChain = <TSeed extends string>(seed: TSeed): RecursionResultUnion<TSeed, 8>[] => {
  return solveRecursiveRoute(seed, 8).map((value, index) => {
    const node = (index % 2 === 0 ? `leaf:${value}` : `depth:${index}:${value}`) as RecursionResultUnion<TSeed, 8>;
    return node;
  }) as RecursionResultUnion<TSeed, 8>[];
};

export const buildSolverMatrix = <TEntries extends readonly string[]>(entries: TEntries): SolverMatrix<TEntries> => {
  const matrix = entries.map((entry) => parseRoute(entry) as RecursionResultUnion<TEntries[number], 5>) as SolverMatrix<TEntries>;
  return matrix;
};

export const solveWithMutualRecursion = <TRoute extends string>(route: TRoute): MutalGrid<TRoute, 9> => {
  return [`${route}-a`, "a9", [route as unknown as MutateInput<TRoute>, "b9", route as unknown as MutateInput<TRoute>]] as unknown as MutalGrid<TRoute, 9>;
};
