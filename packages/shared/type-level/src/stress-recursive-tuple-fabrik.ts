import type { Brand } from './patterns';

export type NumericShape = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BuildTuple<
  Length extends number,
  Value = unknown,
  Acc extends readonly Value[] = [],
> = Acc['length'] extends Length
  ? Acc
  : BuildTuple<Length, Value, [...Acc, Value]>;

export type Decrement<N extends number> = BuildTuple<N> extends [infer _, ...infer Rest]
  ? Rest['length']
  : 0;

export type WrapLeaf<T> = {
  readonly marker: Brand<string, 'wrapped'>;
  readonly payload: T;
};

export type RecursivePayload<T, Depth extends number> = Depth extends 0
  ? WrapLeaf<T>
  : WrapLeaf<RecursivePayload<T, Decrement<Depth>>>;

type GrowState<TState extends unknown[], TStep extends number> = [
  ...TState,
  ...BuildTuple<TStep, { readonly tick: true; readonly step: TStep }>,
];

export type ChainAccumulator<T extends unknown[], State extends unknown[] = []> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends unknown[]
    ? Tail['length'] extends 0
      ? [...State, Head]
      : ChainAccumulator<Tail, [...State, Head, ...BuildTuple<Tail['length'] extends 0 ? 0 : 1, unknown>]>
    : State
  : State;

export type MutualA<T extends unknown[], Count extends number> =
  Count extends 0 ? [] : [...T, ...MutualB<T, Decrement<Count>>];

export type MutualB<T extends unknown[], Count extends number> =
  Count extends 0 ? [] : [Brand<string, 'mutual'>, ...MutualA<T, Decrement<Count>>];

export type PipelineLayer<T, Depth extends number, Steps extends readonly unknown[] = []> = Depth extends 0
  ? Steps
  : PipelineLayer<T, Decrement<Depth>, [...Steps, T, { readonly index: Depth; readonly token: Brand<string, 'pipeline-step'> }] >;

export type DeepCatalog<T extends readonly unknown[], Depth extends number = 12> = Depth extends 0
  ? T
  : DeepCatalog<[
      ...T,
      ...BuildTuple<Depth, T[number]>,
      ...PipelineLayer<T[number], 2>,
    ], Decrement<Depth>>;

export type RecursiveSolverPath<T extends string, Depth extends number> = Depth extends 0
  ? [Brand<T, 'solver-end'>]
  : [Brand<T, 'solver-start'>, ...RecursiveSolverPath<T, Decrement<Depth>>];

export type SplitDigits<T extends string, Acc extends unknown[] = []> = T extends `${infer Head}${infer Tail}`
  ? Head extends NumericShape
    ? SplitDigits<Tail, [...Acc, Head]>
    : SplitDigits<Tail, Acc>
  : Acc;

export type NumericFold<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends number
    ? Head & number
    : NumericFold<Tail>
  : never;

export type RouteTuple<T extends readonly unknown[]> = { readonly tuple: T };

type RecursiveToken<T extends number, Prefix extends string = 'seed'> = Prefix &
  (T extends 0 ? never : `.${RecursiveToken<Decrement<T>, Prefix>}`);

export type RouteChain<Len extends number> = BuildTuple<Len> extends infer Items
  ? Items extends unknown[]
    ? {
        readonly routeId: Brand<string, 'route-chain'>;
        readonly entries: RouteTuple<{
          [K in keyof Items]: Brand<`/${number}`, `route-${K & number}`>;
        }>;
        readonly token: RecursiveToken<Len>;
      }
    : never
  : never;

export const tupleBuilders = {
  binary: (n: number) => Array.from({ length: n }, () => 1),
  reversed: (n: number) => Array.from({ length: n }, (_, index) => index).reverse(),
};

export const materializeRecursion = <T, D extends number>(
  value: T,
  depth: D,
): RecursivePayload<T, D> => {
  let memo: unknown = value;
  for (let index = 0; index < Number(depth); index += 1) {
    memo = {
      marker: `wrapped:${index}` as Brand<string, 'wrapped'>,
      payload: memo,
    };
  }
  return {
    marker: `seed:${depth}` as Brand<string, 'wrapped'>,
    payload: memo as WrapLeaf<T>,
  } as RecursivePayload<T, D>;
};

export const foldNumericTuple = (path: string): number => {
  const chars = path.split('');
  let score = 0;
  for (const token of chars) {
    score += token.length;
    if (/\d/.test(token)) {
      score += Number.parseInt(token, 10);
    }
  }
  return score;
};

export const buildRouteChain = <T extends number>(depth: T): RouteChain<T> => {
  const entries = Array.from({ length: Number(depth) }, (_, index) => `/${index}`) as {
    [K in keyof BuildTuple<T>]: Brand<`/${number}`, `route-${K & number}`>;
  };

  return {
    routeId: `chain:${depth}` as Brand<string, 'route-chain'>,
    entries: { tuple: entries },
    token: `seed` as RecursiveToken<T>,
  } as RouteChain<T>;
};

export const runRecursiveBuilders = (depth = 12): {
  readonly payload: RecursivePayload<{ kind: 'seed'; labels: readonly string[] }, 4>;
  readonly catalog: readonly string[];
  readonly chain: RouteChain<4>;
} => {
  const baseSeed = {
    kind: 'seed' as const,
    labels: ['a', 'b', 'c'] as const,
  };
  const payload = materializeRecursion(
    baseSeed,
    4,
  );

  const catalog = [...buildRouteChain(4).entries.tuple] as readonly string[];
  const chain = buildRouteChain(4);

  return { payload, catalog, chain };
};
