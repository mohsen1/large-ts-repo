export type BuildTuple<N extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends N
  ? Acc
  : BuildTuple<N, [...Acc, unknown]>;

export type NatLength<T extends readonly unknown[]> = T['length'];

export type Decrement<N extends number> = BuildTuple<N> extends readonly [infer _Head, ...infer Tail] ? Tail['length'] : never;

export type Increment<N extends number> = NatLength<[unknown, ...BuildTuple<N>]>;

export type Add<A extends number, B extends number> = NatLength<[...BuildTuple<A>, ...BuildTuple<B>]>;

export type Multiply<A extends number, B extends number, Acc extends unknown[] = []> =
  B extends 0
    ? NatLength<Acc>
    : B extends 1
      ? Add<A, 0>
      : Multiply<A, Decrement<B>, [...BuildTuple<A>, ...Acc]>;

export type WrapValue<T, S extends number> = { readonly depth: S; readonly payload: T };

export type ReWrap<T, N extends number, Acc extends unknown[] = []> =
  Acc['length'] extends N
    ? T
    : WrapValue<ReWrap<T, N, [...Acc, unknown]>, Acc['length']>;

export type NestShape<T, N extends number> = N extends 0
  ? T
  : { readonly depth: N; readonly child: NestShape<WrapValue<T, N>, Decrement<N>> };

export type NormalizeShape<T, Acc extends readonly unknown[] = []> = T extends { readonly child: infer C }
  ? NormalizeShape<C, [...Acc, unknown]>
  : Acc['length'];

type Fiber<T, D extends number> = D extends 0
  ? { readonly value: T; readonly level: 'root' }
  : { readonly value: T; readonly level: `depth-${D}`; readonly next: Fiber<T, Decrement<D>> };

export type FiberChain<T, D extends number> = Fiber<T, D> & { readonly checksum: `${T & string}:${D}` };

export type UnwindFiber<T> = T extends Fiber<infer V, infer D>
  ? D extends 0
    ? [V, D]
    : T extends { readonly next: infer Next }
      ? [V, D, ...UnwindFiber<Next>]
      : [V, D]
  : [];

type NodeA<T> = { readonly kind: 'a'; readonly value: T };
type NodeB<T> = { readonly kind: 'b'; readonly next: T };
type NodeC<T> = { readonly kind: 'c'; readonly next: T };

export type FoldChain<T, N extends number> = N extends 0
  ? NodeA<T>
  : N extends 1
    ? NodeB<NodeA<T>>
    : N extends 2
      ? NodeC<NodeB<NodeA<T>>>
      : FoldChain<NodeC<T>, Decrement<N>>;

export type ResolveFold<T extends ReadonlyArray<unknown>, D extends number> = D extends 0 ? T : ResolveFold<[...T, ...BuildTuple<D>], Decrement<D>>;

export type AccumulateSolver<T, D extends number, Acc extends unknown[] = []> = D extends 0
  ? [...Acc, T]
  : AccumulateSolver<WrapValue<T, D>, Decrement<D>, [...Acc, D]>;

export type ParsePath<T extends string, D extends number = 10> = D extends 0
  ? []
  : T extends `${infer Head}/${infer Rest}`
    ? [Head, ...ParsePath<Rest, Decrement<D>>]
    : [T];

export type NormalizePath<T extends string> = {
  readonly parts: readonly string[];
  readonly size: number;
};

export type RouteGraph<T extends string, D extends number> = {
  readonly shape: NormalizePath<T>;
  readonly folded: ResolveFold<[T], D>;
  readonly wrapped: ReWrap<T, D>;
  readonly nested: NestShape<T, D>;
};

export type Recursor<T, N extends number> = N extends 0
  ? { readonly item: T }
  : {
      readonly item: T;
      readonly branch: Recursor<T, Decrement<N>>;
      readonly step: N;
    };

export const buildSolver = <T extends string, D extends 4 | 8 | 16 | 32>(input: T): Recursor<T, D> => {
  const root = {
    item: input,
    branch: {} as unknown as Recursor<T, Decrement<D>>,
    step: 0 as D,
  };
  return root as Recursor<T, D>;
};

export const recurseTuple = <N extends number>(value: string, depth: N): BuildTuple<N> => {
  const tuple = Array.from({ length: depth }, () => value);
  return tuple as BuildTuple<N>;
};

export const solvePath = <T extends string, Depth extends number>(route: T, depth: Depth): RouteGraph<T, Depth> => {
  const split = route.split('/');
  return {
    shape: {
      parts: split,
      size: split.length,
    } as NormalizePath<T>,
    folded: split
      .slice(0, Math.max(1, Number(depth)))
      .slice(0, Number(depth)) as unknown as ResolveFold<[T], Depth>,
    wrapped: { payload: route, depth: 0 } as unknown as ReWrap<T, Depth>,
    nested: { depth: Number(depth), child: { depth: 0, payload: route } } as unknown as NestShape<T, Depth>,
  };
};

export const buildRecursiveCatalog = <TEntries extends readonly string[], D extends number>(entries: TEntries, depth: D): Array<RouteGraph<TEntries[number], D>> => {
  const out: Array<RouteGraph<TEntries[number], D>> = [];
  for (const entry of entries) {
    out.push(solvePath(entry, depth));
  }
  return out;
};

export const pairwiseDepth = <N extends number>(seed: N): {
  readonly addOne: Add<N, 1>;
  readonly timesTwo: Multiply<N, 2>;
  readonly tuple: BuildTuple<N>;
  readonly recursion: ReWrap<{ readonly seed: string }, N>;
} => {
  const nested = {
    depth: Number(seed),
    payload: {
      seed,
    },
    child: {
      depth: 0,
      payload: seed,
    },
  } as unknown as ReWrap<{ readonly seed: string }, N>;

  return {
    addOne: (seed + 1) as Add<N, 1>,
    timesTwo: ((seed as unknown as number) * 2) as Multiply<N, 2>,
    tuple: new Array(Number(seed)).fill({}) as BuildTuple<N>,
    recursion: nested,
  };
};

export type RecursiveCatalog<T extends readonly string[], N extends number> = {
  readonly items: T;
  readonly depth: N;
  readonly catalog: Array<RouteGraph<T[number], N>>;
};
