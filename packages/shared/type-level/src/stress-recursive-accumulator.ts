type NatDecrement = readonly [
  0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32,
];

export type BuildTuple<T, N extends number, Acc extends readonly T[] = []> =
  Acc['length'] extends N ? Acc : BuildTuple<T, N, readonly [...Acc, T]>;

export type Dec4<N extends Nat32> = N extends keyof NatDecrement
  ? NatDecrement[N]
  : 0;

export type Nat32 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32;

export type Clamp<N extends number> = N extends Nat32 ? N : 32;

export type Wrap<T> = {
  readonly wrapped: true;
  readonly value: T;
};

export type Unwrap<T> = T extends { readonly wrapped: true; readonly value: infer V } ? V : T;

export type Rewrap<T, N extends Nat32> = N extends 0 ? T : Wrap<Rewrap<T, Dec4<N>>>;

export type Flatten<T> = T extends Wrap<infer U> ? Flatten<U> : T;

export type MutA<T, N extends Nat32> = N extends 0
  ? { readonly mode: 'leafA'; readonly value: T }
  : MutB<T, Dec4<N>>;

export type MutB<T, N extends Nat32> = N extends 0
  ? { readonly mode: 'leafB'; readonly value: T }
  : MutA<T, Dec4<N>>;

export type RecursiveObject<T> = {
  readonly value: T;
  readonly depth: number;
  readonly next?: RecursiveObject<T>;
};

export type ComposeRecursive<T, N extends Nat32, Acc extends unknown[] = []> =
  N extends 0
    ? Acc
    : ComposeRecursive<T, Dec4<N>, [...Acc, T]>;

export type BuildDepthTuple<T extends Nat32> = ComposeRecursive<T, Clamp<T>>;

export type FlattenDepth<T, N extends Nat32> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends { value: infer V }
      ? FlattenDepth<V, Dec4<N>>
      : Head
    : T;

export type RouteSegments =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'northeast'
  | 'southwest'
  | 'upstream'
  | 'downstream';

export type RoutePath<T extends RouteSegments, N extends Nat32> = N extends 0
  ? `/${T}`
  : `${RoutePath<T, Dec4<N>>}/${N}`;

export type RouteSeparator<N extends Nat32> = N extends 0 ? '' : '/';

export type RecursiveCatalog<T extends RouteSegments, N extends Nat32, Acc extends string = ''> =
  N extends 0
    ? Acc
    : RecursiveCatalog<T, Dec4<N>, `${Acc}${RouteSeparator<N>}${T}-${N}`>;

export type RouteCatalog<T extends readonly RouteSegments[], N extends Nat32> =
  T extends readonly [infer H, ...infer R]
    ? H extends RouteSegments
      ? N extends 0
        ? readonly [{ readonly segment: H }]
        : readonly [{ readonly segment: H }, ...RouteCatalog<R extends readonly RouteSegments[] ? R : [], Dec4<N>>]
      : never
    : readonly [];

export type AccumulatedPayload<T, N extends Nat32, Seed extends readonly unknown[] = []> = N extends 0
  ? { readonly seed: Seed; readonly value: T }
  : AccumulatedPayload<T, Dec4<N>, readonly [unknown, ...Seed]>;

export type SolverState<T, N extends Nat32> = {
  readonly raw: T;
  readonly recursion: ComposeRecursive<T, N>;
  readonly tuple: BuildDepthTuple<N>;
  readonly resolved: Flatten<Rewrap<T, N>>;
};

export type ResolveSolver<T, N extends Nat32> = SolverState<T, N> extends infer R
  ? R & {
      readonly steps: MutA<T, 8>;
      readonly profile: AccumulatedPayload<T, 8>;
      readonly path: RecursiveCatalog<'north', 8>;
    }
  : never;
export type SolveRec<T, N extends Nat32> = ResolveSolver<T, N>;

export const buildTuple = <T, N extends Nat32>(value: T, depth: N): BuildDepthTuple<N> => {
  const out: number[] = [];
  for (let index = 0; index < depth; index += 1) {
    out.push(index);
  }
  return out as unknown as BuildDepthTuple<N>;
};

export const wrapState = <T>(value: T, depth: Nat32): Wrap<T> => ({ wrapped: true, value } as Wrap<T>);

export const unwrapState = <T>(value: Wrap<T> | T): T =>
  (value as Wrap<T>).wrapped ? (value as Wrap<T>).value : (value as T);

export const recursiveTransform = <T>(seed: T, rounds: Nat32): SolverState<T, Nat32> => {
  const path: string[] = [];
  let cursor: unknown = seed;
  for (let index = 0; index < rounds; index += 1) {
    path.push(String(index));
    cursor = { wrapped: true, value: cursor };
  }
  const recursion = buildTuple(seed as T, rounds) as SolverState<T, Nat32>['recursion'];
  const tuple = buildTuple(seed as T, rounds) as SolverState<T, Nat32>['tuple'];
  return {
    raw: seed,
    recursion,
    tuple,
    resolved: unwrapState(cursor as Wrap<T> | T) as SolverState<T, Nat32>['resolved'],
  };
};

export const deepCatalog = (domains: RouteSegments[], rounds: Nat32): RouteCatalog<RouteSegments[], Nat32> => {
  const records = domains.map((domain) => ({ segment: domain }));
  return records as unknown as RouteCatalog<RouteSegments[], Nat32>;
};

export type MutualSolver<T, N extends Nat32> = N extends 0
  ? SolverState<T, 0>
  : ResolveSolver<MutA<T, N>, N>;

export const resolveMutual = <T, N extends Nat32>(seed: T, depth: N): MutualSolver<T, N> => {
  const tuple = buildTuple(seed, depth);
  const catalog = deepCatalog(['north', 'south', 'east', 'west'], depth);
  return {
    raw: seed,
    recursion: tuple,
    tuple,
    resolved: unwrapState(wrapState(seed, depth)),
    steps: { mode: 'leafA', value: seed },
    profile: {
      seed: catalog,
      value: seed,
    },
    path: '/north' as RecursiveCatalog<'north', 8>,
  } as unknown as MutualSolver<T, N>;
};

export const constrainSolver = <T, N extends Nat32>(seed: T, depth: N): SolveRec<T, N> => {
  return resolveMutual(seed, depth) as SolveRec<T, N>;
};
