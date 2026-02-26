type BuildTuple<Length extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends Length
  ? Acc
  : BuildTuple<Length, [...Acc, Acc['length']]>;

export type Decrement<N extends number> = BuildTuple<N> extends readonly [infer _Head, ...infer Tail]
  ? Tail['length']
  : 0;

export type Increment<N extends number> = [...BuildTuple<N>, unknown]['length'];

export type RecursiveWrap<T> = { readonly inner: T; readonly wrapped: true };

export type BuildRecursiveTuple<
  T,
  Depth extends number,
  Acc extends readonly RecursiveWrap<T>[] = [],
> = Depth extends 0
  ? Acc
  : BuildRecursiveTuple<T, Decrement<Depth>, [...Acc, RecursiveWrap<T>]>;

export type TupleDepth<T extends readonly unknown[]> = T['length'];

export type RouteTokenCatalog = `${string & {}}/${string & {}}/${number}`;

export type ParseRouteTuple<Route extends string> = Route extends `${infer Domain}/${infer Command}/${infer Index}`
  ? [Domain, Command, Index]
  : ['unknown', 'unknown', '0'];

export type RoutePartType<T extends readonly string[]> = T extends readonly [
  infer Domain,
  infer Command,
  infer Index,
]
  ? { readonly domain: Domain; readonly command: Command; readonly index: Index; readonly raw: `${Domain & string}/${Command & string}/${Index & string}` }
  : { readonly domain: 'unknown'; readonly command: 'unknown'; readonly index: 0; readonly raw: 'unknown/unknown/0' };

export type RouteParseCatalog<T extends readonly string[]> = {
  readonly [K in keyof T]: T[K] extends string ? RoutePartType<ParseRouteTuple<T[K]>> : never;
};

export type RecursiveCatalog<T, N extends number = 16> = {
  readonly level: N;
  readonly seed: T;
  readonly history: readonly unknown[];
} & (N extends 0
  ? { readonly terminal: true; readonly next: never }
  : { readonly terminal: false; readonly next: RecursiveCatalog<T, Decrement<N>> });

export type RecursiveAccumulator<T, N extends number = 12, Out extends readonly unknown[] = []> = N extends 0
  ? Out
  : RecursiveAccumulator<[...Out, T], Decrement<N>, [...Out, T]>;

export type ExpandCatalogDepth<T, N extends number> = RecursiveAccumulator<T, N> extends readonly (infer U)[] ? U : never;

export type MatchRoute<T extends string> = T extends `*/${infer Mid}/${infer Tail}`
  ? Mid | MatchRoute<Tail>
  : T extends `${infer Head}/${infer Tail}`
    ? Head | MatchRoute<Tail>
    : T;

export type RouteChainByDepth<
  TSeed extends readonly string[],
  Depth extends number,
  Acc extends readonly string[] = [],
> = Depth extends 0
  ? Acc
  : TSeed extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? RouteChainByDepth<Extract<Tail, readonly string[]>, Decrement<Depth>, [...Acc, Head, ...ParseRouteTuple<Head> & readonly string[]]>
      : RouteChainByDepth<Extract<Tail, readonly string[]>, Decrement<Depth>, Acc>
    : Acc;

export type FlattenRouteChain<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...FlattenRouteChain<Extract<Tail, readonly string[]>>]
  : [];

export type ResolveTemplate<T extends string> =
  T extends `${infer Prefix}-${infer Category}::${infer Item}`
    ? {
        readonly prefix: Prefix;
        readonly category: Category;
        readonly item: Item;
      }
    : {
        readonly prefix: 'none';
        readonly category: 'invalid';
        readonly item: T;
      };

export type RecursiveRouteChain<
  T extends string,
  Depth extends number = 20,
  Acc extends readonly unknown[] = [],
> = Depth extends 0
  ? { readonly terminal: true; readonly catalog: Acc; readonly origin: T }
  : {
      readonly terminal: false;
      readonly catalog: Acc;
      readonly depth: Depth;
      readonly route: ResolveTemplate<T>;
      readonly tail: T extends `${string}-${infer Tail}::${infer Item}`
        ? RecursiveRouteChain<`${Tail}::${Item}`, Decrement<Depth>, [...Acc, ResolveTemplate<T>]>
        : { readonly terminal: true; readonly catalog: [...Acc, ResolveTemplate<T>]; readonly origin: T };
    };

export type MutuallyRecursiveA<T extends string, N extends number> = T extends `${infer Prefix}/${infer Rest}`
  ? {
      readonly kind: 'A';
      readonly prefix: Prefix;
      readonly next: MutuallyRecursiveB<Rest, Decrement<N>>;
    }
  : { readonly kind: 'A'; readonly value: T };

export type MutuallyRecursiveB<T extends string, N extends number> = T extends `${infer Prefix}-${infer Rest}`
  ? {
      readonly kind: 'B';
      readonly prefix: Prefix;
      readonly next: N extends 0 ? T : MutuallyRecursiveA<Rest, Decrement<N>>;
    }
  : { readonly kind: 'B'; readonly value: T };

export type MutualLatticeResult<T extends string, N extends number = 8> = MutuallyRecursiveA<T, N> | MutuallyRecursiveB<T, N>;

export type ConstraintFold<
  T extends readonly string[],
  Acc extends readonly unknown[] = [],
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? ConstraintFold<Extract<Tail, readonly string[]>, [...Acc, ResolveTemplate<`domain::${Head & string}`>]>
    : ConstraintFold<Extract<Tail, readonly string[]>, Acc>
  : { readonly accumulated: Acc; readonly count: Acc['length'] };

export type ConstraintSolverGrid<T extends string, N extends number = 10> =
  ConstraintFold<BuildRouteTuples<T>, []> & { readonly routeDepth: N };

export type BuildRouteTuples<
  T extends string,
  Acc extends readonly string[] = [],
> = T extends `${infer Head}/${infer Rest}`
  ? BuildRouteTuples<Rest, [...Acc, `${Head}-${Acc['length']}`]>
  : [...Acc, `${T}-${Acc['length']}`];

export type AccumulateTokens<
  T extends string,
  N extends number = 12,
  Out extends readonly string[] = [],
> = N extends 0
  ? Out
  : T extends `${infer Head}/${infer Rest}`
    ? AccumulateTokens<Rest, Decrement<N>, [...Out, Head]>
    : [...Out, T];

export type BuildConstraintSignature<T extends readonly string[]> = {
  readonly signatures: {
    [K in keyof T]: T[K] extends string ? `${T[K]}-${K & number}` : never;
  };
};

export const materializeRouteLattice = <T extends RouteTupleLike>(routes: readonly T[]): readonly RecursiveCatalog<T, 6>[] => {
  return routes.map((route) => ({
    level: 6,
    seed: route,
    terminal: false,
    history: [],
    next: {
      level: 5,
      seed: route,
      terminal: false,
      history: [route],
      next: {
        level: 4,
        seed: route,
        terminal: true,
        history: [route, route],
      } as unknown as RecursiveCatalog<T, 4>,
    } as unknown as RecursiveCatalog<T, 5>,
  }) as unknown as RecursiveCatalog<T, 6>);
};

export const materializeRecursiveAccumulator = <T, N extends number>(seed: T, depth: N): RecursiveAccumulator<T, N> => {
  const next = (): unknown[] => {
    if (depth === 0) {
      return [seed] as unknown[];
    }
    const tuple: unknown[] = [];
    for (let i = 0; i < Number(depth); i += 1) {
      tuple.push(seed);
    }
    return tuple;
  };
  return next() as RecursiveAccumulator<T, N>;
};

export type RouteTupleLike = `${string}/${string}/${string}`;
