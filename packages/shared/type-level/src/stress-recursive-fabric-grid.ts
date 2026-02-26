export type BuildTuple<N extends number, T extends unknown[] = []> =
  T['length'] extends N ? T : BuildTuple<N, [...T, unknown]>;

export type Decrement<N extends number> = BuildTuple<N> extends [...infer Rest, unknown] ? Rest['length'] : 0;

export type Wrap<T> = { readonly wrapped: T };

export type MutuallyRecursiveA<T, N extends number> =
  N extends 0 ? T : MutuallyRecursiveB<Wrap<T>, Decrement<N>>;

export type MutuallyRecursiveB<T, N extends number> =
  N extends 0 ? T : MutuallyRecursiveC<ReadonlyArray<T>, Decrement<N>>;

export type MutuallyRecursiveC<T, N extends number> =
  N extends 0 ? T : MutuallyRecursiveA<{ readonly value: T }, Decrement<N>>;

export type TupleAccumulator<T, N extends number> =
  N extends 0
    ? readonly [T]
    : [T, ...TupleAccumulator<T, Decrement<N>>];

export type NestedTupleBuilder<T, Depth extends number> =
  Depth extends 0
    ? readonly [T]
    : {
        readonly head: T;
        readonly tail: NestedTupleBuilder<T, Decrement<Depth>>;
      };

export type PathByDepth<T, D extends number> =
  D extends 0
    ? T
    : PathByDepth<
        {
          readonly next: T;
          readonly markers: TupleAccumulator<'marker', D>;
        },
        Decrement<D>
      >;

export type RouteVector = {
  readonly verb: string;
  readonly entity: string;
  readonly region: string;
};

export type RouteVectorMap<T extends readonly RouteVector[], D extends number> = {
  [K in keyof T]: T[K] extends infer TRoute
    ? TRoute extends RouteVector
      ? {
          readonly vector: TRoute;
          readonly depth: D;
          readonly chain: PathByDepth<TRoute, D>;
        }
      : never
    : never;
};

export type RouteGraph<T extends number> = {
  readonly nodes: TupleAccumulator<RouteVector, T>;
  readonly path: PathByDepth<RouteVector, T>;
};

type RouteGraphNext<T extends number> = T extends 0 ? never : RouteGraphBuilder<Decrement<T>>;

export type RouteGraphBuilder<T extends number> =
  T extends 0 ? { readonly graph: 'empty' } : { readonly graph: RouteGraph<T>; readonly next: RouteGraphNext<T> };

type RouteGraphByDepthValue<TValue> = TValue extends number ? RouteGraph<TValue> : never;

export type RouteGraphCatalog<T extends readonly number[]> = {
  [K in keyof T]: RouteGraphByDepthValue<T[K]>;
};

export const buildTuple = <N extends number>(size: N): BuildTuple<N> => {
  const values = [] as unknown[];
  for (let i = 0; i < size; i += 1) {
    values.push(0);
  }
  return values as BuildTuple<N>;
};

export const resolveRecursive = <T, D extends number>(value: T, depth: D): MutuallyRecursiveA<T, D> => {
  const state: unknown = value;
  const recurse = (current: unknown, remaining: number): unknown => {
    if (remaining <= 0) {
      return current;
    }
    return recurse({ wrapped: current }, remaining - 1);
  };
  return recurse(state, depth as number) as MutuallyRecursiveA<T, D>;
};

export const routeDepth = <T extends number>(count: T): TupleAccumulator<'depth', T> => {
  const values = buildTuple(count) as unknown as readonly unknown[];
  const out: unknown[] = [];
  for (let index = 0; index < values.length; index += 1) {
    out.push('depth');
  }
  return out as TupleAccumulator<'depth', T>;
};

export const buildPath = <T, D extends number>(
  root: T,
  depth: D,
): PathByDepth<T, D> => {
  const marker = `m-${depth}` as const;
  if (depth <= 0) {
    return root as PathByDepth<T, D>;
  }

  return {
    next: buildPath({ ...{}, root }, depth - 1 as number),
    head: marker,
  } as PathByDepth<T, D>;
};

export const toRouteGraph = <N extends number>(depth: N): RouteGraph<N> => {
  const values: RouteVector[] = [];
  const nodes = buildTuple(depth) as unknown as readonly unknown[];
  for (let index = 0; index < nodes.length; index += 1) {
    values.push({
      verb: `verb-${index}`,
      entity: `entity-${index}`,
      region: `region-${index % 3}`,
    });
  }
  return {
    nodes: values as TupleAccumulator<RouteVector, N>,
    path: buildPath<RouteVector, N>(values[0] ?? {} as RouteVector, depth),
  } as RouteGraph<N>;
};

export const deepProject = <
  T extends readonly RouteVector[],
  D extends number,
>(items: T, depth: D): RouteVectorMap<T, D> => {
  return items.map((item) => ({
    vector: item,
    depth,
    chain: buildPath(item, depth),
  })) as RouteVectorMap<T, D>;
};
