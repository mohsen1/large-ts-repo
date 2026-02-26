export type BuildTuple<Length extends number, Seed extends readonly unknown[] = []> = Seed['length'] extends Length
  ? Seed
  : BuildTuple<Length, [...Seed, unknown]>;

export type Decrement<N extends number> = BuildTuple<N> extends readonly [infer _Head, ...infer Tail]
  ? Tail['length']
  : 0;

export type Increment<N extends number> = [...BuildTuple<N>, unknown]['length'];

export type Add<A extends number, B extends number> = [...BuildTuple<A>, ...BuildTuple<B>]['length'];

export type Multiply<
  A extends number,
  B extends number,
  Acc extends readonly unknown[] = [],
> = B extends 0
  ? Acc['length']
  : Multiply<A, Decrement<B>, [...BuildTuple<A>, ...Acc]>;

export type RangeFromZero<N extends number, Seed extends readonly number[] = []> = Seed['length'] extends N
  ? Seed
  : RangeFromZero<N, [...Seed, Seed['length']]>;

export type NumberString<N extends number> = `${N}`;

export type FoldNumbers<T extends readonly number[], Seed = number> = T extends readonly [infer H, ...infer R]
  ? H extends number
    ? R extends readonly number[]
      ? [H, ...FoldNumbers<R, Add<Seed & number, H>>]
      : []
    : []
  : [];

export type RecursivePattern<T extends string, N extends number> =
  N extends 0 ? T : RecursivePattern<`${T}/${N}`, Decrement<N>>;

export type BuildRouteTree<
  TDomains extends readonly string[],
  TVerb extends string,
  Prefix extends string = '',
  Counter extends readonly unknown[] = [],
> = TDomains extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends readonly string[]
      ? {
          [K in Head]: Tail extends readonly []
            ? `${Prefix}/${Head}/${TVerb}/${NumberString<Counter['length']>}`
            : BuildRouteTree<Tail, TVerb, `${Prefix}/${Head}`, [...Counter, unknown]>;
        }
      : never
    : never
  : `${Prefix}/${TVerb}/${NumberString<Counter['length']>}`;

export type RecursiveTemplateMap<T extends Record<string, unknown>, Prefix extends string = ''> =
  T extends Record<string, unknown>
    ? {
        [K in keyof T & string]: T[K] extends Record<string, unknown>
          ? RecursiveTemplateMap<T[K], `${Prefix}${K}.`>
          : {
              readonly key: `${Prefix}${K}`;
              readonly value: T[K];
              readonly path: `${Prefix}${K}`;
            };
      }
    : never;

export type ResolvePath<T, Prefix extends string> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? ResolvePath<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
  : never;

export type NormalizeRouteKey<T extends string> = T extends `${infer Head}::${infer Tail}` ? `${Lowercase<Head>}_${Tail}` : Lowercase<T>;

export type NormalizeRoutes<TRoute extends readonly string[]> = {
  [K in keyof TRoute]: TRoute[K] extends string ? NormalizeRouteKey<TRoute[K]> : never;
};

export type RoutePair<A extends string, B extends string> =
  A extends `${infer A1}-${infer A2}`
    ? B extends `${infer B1}-${infer B2}`
      ? {
          readonly a: `${A1}/${A2}`;
          readonly b: `${B1}/${B2}`;
          readonly merged: `${A1}-${B1}/${A2}-${B2}`;
        }
      : never
    : never;

export type RouteMatrix<
  A extends readonly string[],
  B extends readonly string[],
  Out extends readonly unknown[] = [],
> = A extends readonly [infer HeadA, ...infer TailA]
  ? HeadA extends string
    ? TailA extends readonly string[]
      ? B extends readonly [infer HeadB, ...infer TailB]
        ? HeadB extends string
          ? TailB extends readonly string[]
            ? RouteMatrix<TailA, TailB, [...Out, RoutePair<HeadA, HeadB>]>
            : RouteMatrix<TailA, [], Out>
          : RouteMatrix<TailA, [], Out>
        : RouteMatrix<TailA, [], Out>
      : Out
    : Out
  : Out;

export type BuildRoutePairCatalog<A extends readonly string[], B extends readonly string[]> = RouteMatrix<A, B>;

export type RecursiveUnionFold<
  T extends string,
  Acc extends string = '',
  Depth extends number = 0,
> = Depth extends 0
  ? Acc
  : T extends `${infer Head}${infer Rest}`
    ? RecursiveUnionFold<Rest, `${Acc}${Head}${Acc}`, Decrement<Depth>>
    : `${Acc}${T}`;

export type FoldRoutes<T extends readonly string[], Acc extends readonly string[] = []> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? Tail extends readonly string[]
        ? FoldRoutes<Tail, [...Acc, `${Head}/${Tail['length']}`]>
        : Acc
      : Acc
    : Acc;

export type MutualPair<A extends string, B extends string> =
  A extends `${infer L1}${infer R1}`
    ? B extends `${infer L2}${infer R2}`
      ? L1 extends L2
        ? (R1 extends '' ? `${L1}` : MutualPair<R1, R2>)
        : never
      : never
    : '';

export type MutualRecursionA<T extends string> = T extends `${infer Head}${infer Tail}`
  ? MutualPair<Head, 'ab'> & { readonly next: MutualRecursionB<Tail> }
  : { readonly next: never };

export type MutualRecursionB<T extends string> = T extends `${infer Head}${infer Tail}`
  ? {
      readonly head: Head;
      readonly depth: Tail extends '' ? 0 : 1;
      readonly next: MutualRecursionA<Tail>;
    }
  : { readonly head: never; readonly depth: 0; readonly next: never };

export const tupleFactory = <N extends number>(count: N): BuildTuple<N> => {
  const out: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    out.push(index);
  }
  return out as BuildTuple<N>;
};

export const templateCatalog = {
  route: 'recovery',
  entity: 'agent',
  verb: 'simulate',
  id: 'seed',
} as const;

export const buildRouteTree = <
  TDomains extends readonly string[],
  TVerb extends string,
>(domains: TDomains, verb: TVerb) => {
  const tree: Record<string, unknown> = {};
  let current = tree;
  for (const domain of domains) {
    current[domain] = `${domain}:${verb}`;
    current = {} as Record<string, unknown>;
  }
  return tree;
};

export const normalizeRouteBatch = <T extends readonly string[]>(routes: T): NormalizeRoutes<T> => {
  const normalized = routes.map((route) => route.toLowerCase().replace(/::/g, '_'));
  return normalized as NormalizeRoutes<T>;
};

export const routePairs = <
  A extends readonly string[],
  B extends readonly string[],
>(left: A, right: B): BuildRoutePairCatalog<A, B> => {
  const entries = left.map((leftItem, index) => {
    const rightItem = right[index] ?? '';
    const [leftHead, leftTail] = leftItem.split('-');
    const [rightHead, rightTail] = rightItem.split('-');
    return {
      a: `${leftHead ?? leftItem}/${leftTail ?? 'default'}`,
      b: `${rightHead ?? rightItem}/${rightTail ?? 'default'}`,
      merged: `${leftHead ?? leftItem}-${rightHead ?? rightItem}/${leftTail ?? 'default'}-${rightTail ?? 'default'}`,
    };
  }) as BuildRoutePairCatalog<A, B>;
  return entries as BuildRoutePairCatalog<A, B>;
};

export const recursiveTemplateAccumulator = (seed: string, depth: number): string => {
  let result = seed;
  const maxDepth = depth < 0 ? 0 : depth;
  for (let index = 0; index < maxDepth; index += 1) {
    result = `${result}::${result}`;
  }
  return result;
};

export const foldRouteTree = <TSource extends readonly string[]>(routes: TSource): FoldRoutes<TSource> => {
  const accumulator: string[] = [];
  routes.reduce<string[]>((acc, route, index) => {
    acc.push(`${route}:${index}`);
    return acc;
  }, accumulator);
  return accumulator as FoldRoutes<TSource>;
};

export const evaluateMutual = (payload: string, mode: 'a' | 'b'): string => {
  const normalized = payload.toLowerCase();
  return mode === 'a' ? `${normalized}:a` : `${normalized}:b`;
};

export const decodeMutation = (value: string): MutualRecursionA<typeof value> => {
  const result: { next: unknown } = {
    next: {
      head: value,
      depth: value.length > 0 ? 1 : 0,
      next: value,
    },
  } as MutualRecursionA<typeof value>;
  return result as MutualRecursionA<typeof value>;
};

export const buildRecursiveRouteSet = async <T extends readonly string[]>(routes: T): Promise<BuildRoutePairCatalog<T, T>> => {
  const result = routes
    .map((left, index) => ({
      left,
      right: routes[index] ?? left,
      merged: `${left}-${routes[index] ?? left}`,
    }))
    .map((item) => ({
      a: `${item.left}/${item.left.length}`,
      b: `${item.right}/${item.right.length}`,
      merged: `${item.merged}`,
    }));
  return result as BuildRoutePairCatalog<T, T>;
};

export const recursiveRouteAccumulator = <T extends string>(seed: T, cycles: number) => {
  return [
    ...foldRouteTree([seed] as const),
    recursiveTemplateAccumulator(seed, cycles),
    ...normalizeRouteBatch([seed, `${seed}::expanded`] as const),
  ] as readonly string[];
};
