export type VertexKind =
  | 'alpha'
  | 'beta'
  | 'gamma'
  | 'delta'
  | 'epsilon'
  | 'zeta'
  | 'eta'
  | 'theta'
  | 'iota'
  | 'kappa'
  | 'lambda'
  | 'mu'
  | 'nu'
  | 'xi'
  | 'omicron'
  | 'pi'
  | 'rho'
  | 'sigma'
  | 'tau'
  | 'upsilon'
  | 'phi';

export type HyperEdge = {
  readonly id: string;
  readonly source: VertexKind;
  readonly target: VertexKind;
};

export interface GraphVertex<K extends VertexKind = VertexKind> {
  readonly key: K;
  readonly label: `vertex:${K}`;
  readonly weight: number;
}

export type Graph = {
  readonly vertices: {
    readonly [K in VertexKind]: GraphVertex<K>;
  };
  readonly edges: readonly HyperEdge[];
};

export type Reachability<T extends readonly VertexKind[], V extends VertexKind> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends VertexKind
      ? Head extends V
        ? true
        : Tail extends readonly VertexKind[]
          ? Reachability<Tail, V>
          : false
      : false
    : false;

export type FoldGraph<T extends readonly HyperEdge[], K extends VertexKind, N extends unknown[] = []> =
  N['length'] extends 24
    ? { readonly reached: K; readonly depth: N['length']; readonly complete: true }
    : T extends readonly [infer Head, ...infer Tail]
      ? Head extends HyperEdge
        ? Tail extends readonly HyperEdge[]
          ? Head['source'] extends K
            ? {
                readonly reached: Head['target'];
                readonly depth: N['length'];
                readonly next: FoldGraph<Tail, Head['target'], [...N, { readonly step: N['length'] }]>
              }
            : FoldGraph<Tail, K, [...N, { readonly step: N['length'] }]>
          : { readonly reached: K; readonly depth: N['length']; readonly complete: true }
        : { readonly reached: K; readonly depth: N['length']; readonly complete: true }
      : { readonly reached: K; readonly depth: N['length']; readonly complete: true };

export type MutateState<T, U> = T & U;

export type HyperNode<T extends number, S extends string = ''> = {
  readonly id: `N${T}`;
  readonly state: S;
  readonly active: true;
};

export type HyperStateGraph<T extends number, S extends unknown[] = []> =
  S['length'] extends T
    ? { readonly finished: true; readonly value: T; readonly stack: S }
    : {
        readonly current: HyperNode<S['length'] & number, `s-${S['length']}`>;
        readonly next: HyperStateGraph<T, [...S, { readonly node: `N${S['length']}` }] >;
      };

export type ConstraintNode<T extends VertexKind> = {
  readonly key: T;
  readonly active: true;
  readonly outgoing: Extract<HyperEdge, { source: T }>[];
};

export type HyperNetwork<T extends readonly HyperEdge[]> = {
  readonly source: {
    [K in VertexKind]: ConstraintNode<K>;
  };
  readonly folded: FoldGraph<T, 'alpha'>;
};

export type MapByEdge<T extends readonly HyperEdge[]> = {
  readonly [K in VertexKind]: readonly Extract<T[number], { source: K }>[];
};

export type RouteTuple<T extends readonly HyperEdge[], N extends unknown[] = []> =
  N['length'] extends 12
    ? {
        readonly tuple: readonly [...N];
        readonly graph: T;
      }
    : RouteTuple<T, [...N, { readonly step: N['length']; readonly value: N['length'] }] >;

export type DepthGuard<T extends number> =
  T extends 0
    ? 0
    : T extends 1
      ? 1
      : T extends 2
        ? 2
        : T extends 3
          ? 3
          : T extends 4
            ? 4
            : T extends 5
              ? 5
              : T extends 6
                ? 6
                : T extends 7
                  ? 7
                  : T extends 8
                    ? 8
                    : T extends 9
                      ? 9
                      : T extends 10
                        ? 10
                        : T;

export type Interp<T extends string, N extends number> = `${T}-${N}`;

export type HyperMap<T extends readonly HyperEdge[], K extends VertexKind = 'alpha'> = {
  readonly key: K;
  readonly label: Interp<`k${K}`, DepthGuard<T['length']>>;
  readonly route: RouteTuple<T>;
  readonly fold: FoldGraph<T, K>;
};

export type BuildChain<T extends readonly VertexKind[], I extends unknown[] = []> =
  I['length'] extends T['length']
    ? readonly []
    : T extends readonly [infer Head, ...infer Tail]
      ? Head extends VertexKind
        ? Tail extends readonly VertexKind[]
          ? readonly [
              { readonly vertex: Head; readonly index: I['length'] },
              ...BuildChain<Tail, [...I, Head]>
            ]
          : readonly []
        : readonly []
      : readonly [];

export type MergeProfile<A, B> = A & B & { readonly merged: true };

export interface HyperRoutePlan<T extends readonly VertexKind[]> {
  readonly route: T;
  readonly map: MapByEdge<readonly HyperEdge[]>;
  readonly chain: BuildChain<T>;
  readonly state: HyperStateGraph<24>;
}

export const allVertices = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
] as const satisfies readonly VertexKind[];

export const allEdges = [
  { id: 'e1', source: 'alpha', target: 'beta', },
  { id: 'e2', source: 'beta', target: 'gamma', },
  { id: 'e3', source: 'gamma', target: 'delta', },
  { id: 'e4', source: 'delta', target: 'epsilon', },
  { id: 'e5', source: 'epsilon', target: 'zeta', },
  { id: 'e6', source: 'zeta', target: 'eta', },
  { id: 'e7', source: 'eta', target: 'theta', },
  { id: 'e8', source: 'theta', target: 'iota', },
  { id: 'e9', source: 'iota', target: 'kappa', },
  { id: 'e10', source: 'kappa', target: 'lambda', },
  { id: 'e11', source: 'lambda', target: 'mu', },
  { id: 'e12', source: 'mu', target: 'nu', },
  { id: 'e13', source: 'nu', target: 'xi', },
  { id: 'e14', source: 'xi', target: 'omicron', },
  { id: 'e15', source: 'omicron', target: 'pi', },
  { id: 'e16', source: 'pi', target: 'rho', },
  { id: 'e17', source: 'rho', target: 'sigma', },
  { id: 'e18', source: 'sigma', target: 'tau', },
  { id: 'e19', source: 'tau', target: 'upsilon', },
  { id: 'e20', source: 'upsilon', target: 'phi', },
] as const;

export const buildHyperMap = <T extends readonly HyperEdge[]>(
  edges: [...T],
): MapByEdge<T> => {
  const output = {} as any;
  for (const edge of edges) {
    const key = edge.source as VertexKind;
    const bucket = (output[key] ?? []) as unknown[];
    output[key] = [...bucket, edge];
  }
  return output as MapByEdge<T>;
};

export const foldHyper = <T extends readonly HyperEdge[]>(edges: [...T]) => {
  const folded = edges.reduce((acc, edge, index) => {
    return `${acc}/${edge.id}:${index}`;
  }, '/root');
  return {
    folded,
    final: edges.at(-1)?.target ?? 'alpha',
  };
};

export const routeHyper = <T extends readonly HyperEdge[]>(edges: [...T]): HyperNetwork<T> => {
  return {
    source: allVertices.reduce((acc, vertex) => {
      acc[vertex] = {
        key: vertex,
        active: true,
        outgoing: edges.filter((edge) => edge.source === vertex),
      };
      return acc;
    }, {} as any),
    folded: undefined as unknown as FoldGraph<T, 'alpha'>,
  };
};

export const buildHyperRoute = <T extends readonly VertexKind[]>(vertices: [...T]): HyperRoutePlan<T> => {
  const edgeSet = [
    { id: 'e1', source: 'alpha', target: vertices[1] ?? 'beta' },
    { id: 'e2', source: vertices[1] ?? 'beta', target: vertices[2] ?? 'gamma' },
    { id: 'e3', source: vertices[2] ?? 'gamma', target: vertices[3] ?? 'delta' },
    { id: 'e4', source: vertices[3] ?? 'delta', target: vertices[4] ?? 'epsilon' },
  ] as const;

  return {
    route: vertices,
    map: buildHyperMap(edgeSet as [...(typeof edgeSet)]) as unknown as MapByEdge<readonly HyperEdge[]>,
    chain: [] as unknown as BuildChain<T>,
    state: { current: { id: 'N0', state: 's-0', active: true }, next: { finished: true, value: 24, stack: [] } as any },
  };
};

export const evaluateReachability = <T extends readonly HyperEdge[]>(edges: [...T], start: VertexKind, goal: VertexKind): boolean => {
  const map = buildHyperMap(edges);
  const seen = new Set<string>();
  let queue: VertexKind[] = [start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (current === goal) {
      return true;
    }
    const outgoing = map[current] as unknown as { target: VertexKind }[] | undefined;
    for (const edge of outgoing ?? []) {
      queue.push(edge.target);
    }
  }

  return false;
};

export const recursiveConstraint = <N extends number, T extends readonly VertexKind[]>(
  vertices: [...T],
  depth: N,
  path: string[] = [],
): { readonly path: string[]; readonly depth: N } => {
  return {
    path,
    depth,
  };
};
