import type { Brand } from '@shared/core';
import type { PluginKind, StudioArtifact } from './contract';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type EdgeWeight = 0 | 1 | 2 | 3 | 4 | 5;

export interface GraphNode<
  TId extends string,
  TKind extends PluginKind = PluginKind,
  TData = unknown,
> {
  readonly id: Brand<TId, 'GraphNodeId'>;
  readonly kind: TKind;
  readonly data: TData;
}

export interface GraphEdge<TId extends string, W extends EdgeWeight = EdgeWeight, TMetadata = unknown> {
  readonly from: TId;
  readonly to: TId;
  readonly weight: W;
  readonly metadata?: TMetadata;
}

export interface Graph<N extends string = string, E = unknown> {
  readonly root: N;
  readonly nodes: ReadonlyMap<N, GraphNode<N>>;
  readonly edges: readonly GraphEdge<N, EdgeWeight, E>[];
}

export type NodeIdTuple = readonly [string, string];
export type TuplePaths<TPath extends readonly unknown[]> = TPath extends readonly [infer Head, ...infer Rest]
  ? readonly [Head, ...TuplePaths<Rest>]
  : readonly [];

type HasNode<TGraph extends Graph, TNode extends keyof any> = TNode extends keyof TGraph ? true : false;
export type PathFromNode<TGraph extends Graph, TFrom extends keyof any, TTo extends keyof any> =
  HasNode<TGraph, TFrom> extends true
    ? HasNode<TGraph, TTo> extends true
      ? readonly [TFrom & string, ...(TFrom extends TTo ? [] : [string])]
      : never
    : never;

export const createEdge = <N extends string>(
  from: N,
  to: N,
  weight: EdgeWeight,
  metadata?: unknown,
): GraphEdge<N> => ({
  from,
  to,
  weight,
  metadata,
});

export const describeGraph = <N extends string>(graph: Graph<N>): {
  readonly labels: readonly N[];
  readonly totalEdges: number;
} => ({
  labels: [...graph.nodes.keys()],
  totalEdges: graph.edges.length,
});

export const graphRoutes = <N extends string>(
  graph: Graph<N>,
  from: N,
  to: N,
  maxDepth = 12,
): readonly NodeIdTuple[] => {
  const out: NodeIdTuple[] = [];
  const seen = new Set<string>();

  const walk = (cursor: N, target: N, trail: readonly string[], depth: number): boolean => {
    const key = `${cursor}:${trail.join('>')}`;
    if (seen.has(key) || depth > maxDepth) return false;
    seen.add(key);

    if (cursor === target && trail.length > 0) {
      return true;
    }

    for (const edge of graph.edges) {
      if (edge.from !== cursor) continue;
      const next = edge.to as N;
      if (walk(next, target, [...trail, next], depth + 1)) {
        out.push([cursor, next]);
      }
    }

    return false;
  };

  walk(from, to, [from], 0);
  return out;
};

export const toDot = <N extends string>(graph: Graph<N>): string => {
  const vertex = (node: GraphNode<N>): string => `  "${node.id}" [label="${String(node.kind)}"]`;
  const links = (edge: GraphEdge<N>): string => `  "${edge.from}" -> "${edge.to}" [weight=${edge.weight}]`;

  const payload = [
    'digraph studio {',
    ...[...graph.nodes.values()].map(vertex),
    ...graph.edges.map(links),
    '}',
  ].join('\n');

  return payload;
};

export type ArtifactGraphInput<TArtifact extends StudioArtifact, TDepth extends number> = {
  readonly artifact: TArtifact;
  readonly depth: TDepth;
  readonly tags: readonly string[];
};

export const normalizeNode = <T extends StudioArtifact>(artifact: T): ArtifactGraphInput<T, T['tags']['length']> => ({
  artifact,
  depth: artifact.tags.length,
  tags: artifact.tags,
});

export const flattenPath = <TValue>(path: readonly TValue[]): TValue[] =>
  path.reduce<TValue[]>((accumulator, value) => {
    if ((accumulator as readonly TValue[]).includes(value)) {
      return accumulator;
    }
    accumulator.push(value);
    return accumulator;
  }, []);

export const tuplePaths = <TPath extends readonly Primitive[]>(
  ...paths: TuplePaths<TPath>
): readonly TuplePaths<TPath>[] => {
  return [paths];
};
