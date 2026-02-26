import type { Branded, NoInferAdvanced } from './composition-labs';

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BoundedDepth =
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
  | 18;

type Decrement = {
  0: 0;
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
};

export type OrchestratorPath<T extends BoundedDepth, TAcc extends readonly string[] = []> = T extends 0
  ? TAcc
  : OrchestratorPath<Decrement[T], readonly [...TAcc, `${string & { length: 1 }}`]>;

export type Wrap<T> = {
  readonly wrapped: true;
  readonly value: T;
};

export type Unwrap<T> = T extends { readonly wrapped: true; readonly value: infer V } ? V : T;

export type RecurEncode<T, N extends BoundedDepth> = N extends 0 ? Wrap<T> : RecurEncode<Wrap<T>, Decrement[N]>;
export type RecurDecode<T> = T extends Wrap<infer U> ? RecurDecode<U> : T;

export type RecurDepthRoute<T, N extends BoundedDepth> = {
  readonly state: RecurEncode<T, N>;
  readonly depth: N;
  readonly marker: `d-${N}`;
};

export type RecursiveMatrix<T extends readonly unknown[], N extends BoundedDepth> = N extends 0
  ? T
  : RecursiveMatrix<readonly [...T, unknown], Decrement[N]>;

export type FlattenRec<T> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [Head, ...FlattenRec<Rest>]
  : T extends readonly unknown[]
    ? T
    : [];

export type AccumulatorBranch<T, N extends BoundedDepth, TAcc extends readonly unknown[]> = N extends 0
  ? { readonly value: T; readonly tags: TAcc }
  : AccumulatorBranch<T, Decrement[N], readonly [...TAcc, RecurDepthRoute<T, Decrement[N]>]>;

export type MutualA<T, N extends BoundedDepth> = N extends 0
  ? Wrap<{ readonly mode: 'leaf'; readonly payload: T }>
  : MutualB<Wrap<{ readonly mode: 'mid'; readonly payload: T }>, Decrement[N]>;

export type MutualB<T, N extends BoundedDepth> = N extends 0 ? T : MutualC<Unwrap<T>, Decrement[N]>;

export type MutualC<T, N extends BoundedDepth> = N extends 0
  ? { readonly mode: 'final'; readonly value: T }
  : MutualA<{ readonly value: T }, Decrement[N]>;

export type BuildTuple<T, N extends BoundedDepth, Acc extends readonly T[] = []> = N extends 0
  ? readonly [...Acc]
  : BuildTuple<T, Decrement[N], readonly [...Acc, T]>;

export type SolverPayload<T, N extends BoundedDepth> = {
  readonly input: T;
  readonly depth: N;
  readonly graph: RecursiveMatrix<readonly [T], N>;
  readonly path: OrchestratorPath<N>;
  readonly route: RecurDepthRoute<T, N>;
  readonly fold: AccumulatorBranch<T, N, []>;
};

export type SolverResult<T, N extends BoundedDepth> = SolverPayload<T, N> & {
  readonly result: RecurDecode<MutualA<T, N>>;
};

export type SolverConstraint<A extends string, B extends Record<string, unknown>> = B extends infer C
  ? A extends keyof C & string
    ? {
        readonly key: A;
        readonly value: C[A & keyof C];
      }
    : never
  : never;

export type BuildSolverInput<TContext, TTag extends string> = {
  readonly context: TContext;
  readonly tag: Branded<TTag, 'SolverTag'>;
  readonly options: {
    readonly strict: boolean;
    readonly depth: BoundedDepth;
  };
};

export const runSolver = <TContext, const TTag extends string, const TDepth extends BoundedDepth>(
  payload: BuildSolverInput<TContext, TTag>,
): SolverResult<TContext, TDepth> => {
  const depth = payload.options.depth as TDepth;
  const matrix = [payload.context] as unknown as RecursiveMatrix<readonly [TContext], TDepth>;
  const path = [] as unknown as OrchestratorPath<TDepth>;
  return {
    input: payload.context,
    depth,
    graph: matrix,
    path,
    route: { state: { payload: payload.context, route: payload.tag }, depth, marker: `d-${depth}` } as RecurDepthRoute<TContext, TDepth>,
    fold: { value: payload.context, tags: [] } as AccumulatorBranch<TContext, TDepth, []>,
    result: payload.context as RecurDecode<MutualA<TContext, TDepth>>,
  } as SolverResult<TContext, TDepth>;
};

export const buildSolverTuple = <T, const N extends BoundedDepth>(value: T, depth: N): BuildTuple<T, N> => {
  const width = Math.min(Number(depth), 18);
  return [...Array(width).keys()].map(() => value) as unknown as BuildTuple<T, N>;
};

export const matrixTrace = <T, const N extends BoundedDepth>(items: readonly T[], depth: N): RecursiveMatrix<T extends never ? never : [T], N> => {
  let frame = items as readonly [T, ...T[]];
  for (let index = 0; index < Number(depth) && index < 20; index += 1) {
    frame = [...frame, frame[0]] as [T, ...T[]];
  }
  return frame as RecursiveMatrix<T extends never ? never : [T], N>;
};

export const constrainedTransform = <T extends Record<string, unknown>, K extends NoInferAdvanced<keyof T & string>>(
  record: T,
  key: K,
): SolverConstraint<K, T> => ({
  key,
  value: record[key],
} as SolverConstraint<K, T>);

export const solveWithDisposal = async <TContext, const N extends BoundedDepth>(
  seed: TContext,
  depth: N,
): Promise<SolverResult<TContext, N>> => {
  if ('AsyncDisposableStack' in globalThis) {
    const AsyncStackCtor = globalThis as unknown as { AsyncDisposableStack: new () => { [Symbol.asyncDispose](): Promise<void> } };
    await using _stack = new AsyncStackCtor.AsyncDisposableStack();
    void _stack;
  } else if ('DisposableStack' in globalThis) {
    const StackCtor = globalThis as unknown as { DisposableStack: new () => { [Symbol.dispose](): void } };
    using _stack = new StackCtor.DisposableStack();
    void _stack;
  }
  return runSolver({
    context: seed,
    tag: `solver-${String(depth)}` as Branded<string, 'SolverTag'>,
    options: { strict: true, depth },
  });
};

export const foldRoute = <T, const N extends BoundedDepth>(
  value: T,
  depth: N,
): string => {
  let current = value;
  for (let index = 0; index < Number(depth); index += 1) {
    current = { wrapped: true, value: current } as unknown as T;
  }
  return `resolved-${depth}-${String(current)}`;
};

export type SolverConstraintFn = <T extends readonly string[], N extends BoundedDepth>(
  values: T,
  depth: N,
) => SolverResult<T[number], N>;

export const solverOverloads: SolverConstraintFn = <T extends readonly string[], N extends BoundedDepth>(
  values: T,
  depth: N,
): SolverResult<T[number], N> => {
  return runSolver({
    context: values[0] as T[number],
    tag: `bulk-${values.length}` as Branded<string, 'SolverTag'>,
    options: { strict: values.length > 8, depth },
  });
};

