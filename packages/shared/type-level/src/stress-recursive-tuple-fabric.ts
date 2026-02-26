export type BuildTuple<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : BuildTuple<N, [...T, unknown]>;

export type Length<T extends readonly unknown[]> = T['length'];

export type Decrement<N extends number> =
  [...BuildTuple<N>] extends [unknown, ...infer Rest] ? Rest['length'] : never;

export type Increment<N extends number> = [...BuildTuple<N>, unknown]['length'];

export type Repeat<T, N extends number, Acc extends unknown[] = []> = Acc['length'] extends N ? Acc : [...Repeat<T, N, [...Acc, T]>];

export type PairFold<
  T extends readonly unknown[],
  Acc extends readonly unknown[] = [],
> = T extends [infer Head, ...infer Tail]
  ? PairFold<Tail, [...Acc, Head]>
  : { readonly collected: Acc; readonly count: Acc['length'] };

export type WrappedTuple<T, Depth extends number> = Depth extends 0
  ? { readonly value: T }
  : { readonly value: T; readonly nested: WrappedTuple<T, Decrement<Depth>> };

export type UnwrapTuple<T> = T extends { value: infer V; nested: infer N }
  ? { readonly value: V; readonly inner: UnwrapTuple<N> }
  : T extends { value: infer V }
    ? { readonly value: V }
    : never;

export type RecursiveCatalog<T extends string, N extends number> =
  N extends 0 ? T : `${T}/${RecursiveCatalog<T, Decrement<N>>}`;

export type TupleAccumulator<T extends unknown[], Acc extends unknown[] = []> =
  T extends [infer Head, ...infer Rest] ? TupleAccumulator<Rest, [...Acc, Head]> : Acc;

export type ReverseTuple<T extends unknown[], Acc extends unknown[] = []> =
  T extends [infer Head, ...infer Rest] ? ReverseTuple<Rest, [Head, ...Acc]> : Acc;

export type MapTuple<T extends unknown[], R> = {
  [K in keyof T]: R;
};

export type RecursiveMap<T extends unknown[]> = T extends [infer Head, ...infer Tail]
  ? [WrappedTuple<Head, 2>, ...RecursiveMap<Tail>]
  : [];

export type ExpandRoutes<
  T extends number,
  L extends string[],
  Guard extends unknown[] = [],
> = Guard['length'] extends 12
  ? []
  : T extends 0
    ? []
    : [...L, ...ExpandRoutes<Decrement<T>, L, [...Guard, unknown]>];

export type RouteTupleFabric<T extends number, Prefix extends string> =
  ExpandRoutes<T, [Prefix]> extends infer R extends string[] ? Readonly<R> : never;

export type MutualGuard<History extends unknown[]> = History['length'] extends 24 ? 'stop' : never;

export type RecursiveMutualA<T extends number, U extends number, Guard extends unknown[] = []> = Guard['length'] extends 24
  ? U
  : T extends 0
    ? U
    : RecursiveMutualB<Decrement<T>, Increment<U> & number, [...Guard, unknown]>;

export type RecursiveMutualB<T extends number, U extends number, Guard extends unknown[] = []> = Guard['length'] extends 24
  ? T
  : U extends 0
    ? T
    : RecursiveMutualA<Decrement<U>, Increment<T> & number, [...Guard, unknown]>;

export type RecursionPairResult = RecursiveMutualA<24, 10>;

export type RouteNode<T extends string, Depth extends number, Guard extends unknown[] = []> = Guard['length'] extends 20
  ? { readonly id: T; readonly leaf: true }
  : Depth extends 0
    ? { readonly id: T; readonly leaf: true }
    : {
        readonly id: T;
        readonly depth: Depth;
        readonly branch: readonly [
          RouteNode<T, Decrement<Depth>, [...Guard, unknown]>,
          RouteNode<T, Decrement<Depth>, [...Guard, unknown]>,
        ];
      };

export const buildTuple = <N extends number>(length: N) => {
  return Array.from({ length }).map((_, index) => ({ index }));
};

export const buildRouteNodes = <T extends string, Depth extends number>(node: T, depth: Depth) => {
  const walk = (current: string, remaining: number): unknown => {
    if (remaining <= 0) {
      return { id: current, leaf: true };
    }
    return {
      id: current,
      depth: remaining,
      branch: [walk(`${current}.${remaining}.a`, remaining - 1), walk(`${current}.${remaining}.b`, remaining - 1)],
    };
  };
  return walk(node, depth as number) as RouteNode<T, Depth>;
};

export const tupleProfiles = (seed: string, count: number, depth: number): ReadonlyArray<readonly string[]> => {
  const tuple = buildTuple(count);
  return tuple.map(() => {
    const generated = buildRouteNodes(seed, depth);
    return buildTuple(depth).map(() => {
      const value = (generated as RouteNode<string, number>).id;
      return value;
    });
  });
};

export type TupleProfile = ReturnType<typeof tupleProfiles>;

export type CatalogBlueprint = {
  readonly routes: BuildTuple<6>;
  readonly signatures: RouteTupleFabric<4, 'route'>;
  readonly depth: RecursionPairResult;
};

export const catalogDepth = buildTuple(8);

export const resolveRecursionDepth = (limit: number) => {
  let current: unknown = { value: 'base', nested: { value: 'nested' } };
  for (let i = 0; i < limit; i += 1) {
    current = { value: `seed-${i}`, nested: current };
  }
  return current as WrappedTuple<string, 8>;
};

export const tupleCatalog = {
  base: buildTuple(12),
  chain: catalogDepth,
  recursive: resolveRecursionDepth(5),
  reverse: [...catalogDepth].reverse(),
  mapped: catalogDepth.map((value, index) => ({ index, value })) as unknown as MapTuple<BuildTuple<12>, { readonly mapped: true }>,
} as const;

export type RouteTupleCatalog = typeof tupleCatalog;
export type TupleBlueprint = Readonly<RouteTupleCatalog['base']> | RouteTupleFabric<3, 'atlas'> | CatalogBlueprint;
