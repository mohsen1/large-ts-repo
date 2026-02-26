export type BuildTuple<N extends number, State extends readonly unknown[] = []> = State['length'] extends N
  ? State
  : BuildTuple<N, [...State, unknown]>;

export type Decrement<N extends number> = BuildTuple<N> extends readonly [unknown, ...infer Tail]
  ? Tail['length']
  : never;

export type Increment<N extends number> = BuildTuple<N> extends readonly [...infer Head]
  ? [...Head, unknown]['length']
  : never;

export type AppendMarker<T, M extends string> = {
  readonly payload: T;
  readonly marker: M;
};

export type WrapPayload<T, N extends number> = N extends 0 ? T : AppendMarker<T, `depth-${N}`>;

export type RecurseWrap<T, N extends number> = N extends 0 ? T : RecurseWrap<WrapPayload<T, N>, Decrement<N>>;

export type RecurseTuple<T extends readonly unknown[], N extends number> =
  N extends 0 ? T : RecurseTuple<[...T, ...T], Decrement<N>>;

export type DeepNode<T, D extends number> = D extends 0
  ? {
      readonly leaf: T;
      readonly level: 'leaf';
      readonly next: never;
    }
  : {
      readonly leaf: T;
      readonly level: 'branch';
      readonly levelIndex: D;
      readonly next: DeepNode<WrapPayload<T, D>, Decrement<D>>;
    };

export type BranchNode<T, D extends number> = {
  readonly value: T;
  readonly level: D;
  readonly children: readonly DeepNode<T, D>[];
};

export type NodeGraph<T, D extends number, Acc extends readonly unknown[] = []> =
  D extends 0 ? Acc : NodeGraph<T, Decrement<D>, [...Acc, BranchNode<T, D>]>;

export type MutualA<T, D extends number> = D extends 0 ? { readonly payload: T; readonly depth: 0 } : MutualB<AppendMarker<T, `a-${D}`>, Decrement<D>>;

export type MutualB<T, D extends number> = D extends 0 ? { readonly stop: T; readonly depth: 0 } : MutualA<{ readonly step: T }, Decrement<D>>;

export type RecursiveCatalog<T extends string, D extends number> = {
  readonly route: T;
  readonly level: D;
  readonly graph: NodeGraph<T, D>;
  readonly nested: RecurseWrap<{ route: T; level: D }, D>;
  readonly mutual: MutualA<T, D>;
};

export type SolverTuple<T, N extends number> = N extends 0 ? [] : [T, ...SolverTuple<T, Decrement<N> & number>];

export type NumericExpr<T extends number, D extends number> = D extends 0 ? T : NumericExpr<T, Decrement<D>>;

export type RecursiveUnion<T, U, D extends number> = D extends 0 ? T | U : RecursiveUnion<AppendMarker<T, `x-${D}`>, AppendMarker<U, `y-${D}`>, Decrement<D>>;

export type RangeMap<T extends number, D extends number> = T;

export const buildTuple = <N extends number>(depth: N): BuildTuple<N> => Array.from({ length: Number(depth) }) as BuildTuple<N>;

export const composeBranch = <T, D extends number>(value: T, depth: D): DeepNode<T, D> => {
  const createLevel = <V>(seed: V, at: number): DeepNode<V, any> => {
    return at <= 0
      ? ({ leaf: seed, level: 'leaf', next: undefined as never }) as DeepNode<V, any>
      : ({ leaf: seed, level: 'branch', levelIndex: at, next: createLevel(seed as V, at - 1) }) as DeepNode<V, any>;
  };

  return createLevel(value, Number(depth)) as DeepNode<T, D>;
};

export const foldBranch = <T, D extends number>(value: T, depth: D): RecursiveCatalog<`route-${D}`, D> => ({
  route: `route-${depth}` as `route-${D}`,
  level: depth,
  graph: [] as NodeGraph<`route-${D}`, D>,
  nested: ({ route: `route-${depth}` as `route-${D}`, level: depth } as unknown) as RecurseWrap<
    { route: `route-${D}`; level: D },
    D
  >,
  mutual: {
    payload: `route-${depth}`,
    depth: 0,
  } as MutualA<`route-${D}`, D>,
});

export const emitNodeGraph = <T, D extends number>(seed: T, depth: D): NodeGraph<T, D> => {
  const graph: Array<BranchNode<T, D>> = [];
  const max = Number(depth);
  for (let index = 1; index <= max; index += 1) {
    graph.push({
      value: seed,
      level: (index as D),
      children: [] as readonly DeepNode<T, D>[],
    });
  }
  return graph as NodeGraph<T, D>;
};

export const runSolverTuple = <N extends number>(size: N) => {
  const tuple = Array.from({ length: Number(size) }, (_, idx) => `seed-${idx}`) as SolverTuple<string, N>;
  return tuple.reduce((acc, item) => `${acc}|${item}`, 'seed');
};

export const recursiveBuild = <T, D extends number>(value: T, depth: D): RecurseTuple<[T], D> => {
  return Array.from({ length: Math.max(1, Number(depth)) }, () => value) as RecurseTuple<[T], D>;
};

export const mutualSolver = <T, D extends number>(value: T, depth: D): MutualA<T, D> => {
  let cursor: unknown = value;
  let step = 0;
  let marker: number = depth as number;
  while (step < Math.max(1, Number(depth))) {
    cursor = {
      payload: cursor,
      marker: `a-${marker - step}`,
    };
    step += 1;
    marker -= 1;
  }
  return cursor as MutualA<T, D>;
};
