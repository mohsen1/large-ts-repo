import { asRouteId, asZoneId, BrandedTraceId, LatticeContext, LatticeRouteId, LatticeWindowId, asWindowId } from './ids';
import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import { NoInfer, Optionalize } from '@shared/type-level';

export type TopologyWeight = 0 | 1 | 2 | 3 | 4 | 5;

export interface TopologyNode<N extends string = string> {
  readonly id: Brand<string, `topology-node:${N}`>;
  readonly zoneId: string;
  readonly kind: N;
  readonly capacity: number;
}

export interface TopologyEdge<N extends string = string> {
  readonly from: Brand<string, `topology-node:${N}`>;
  readonly to: Brand<string, `topology-node:${N}`>;
  readonly latencyMs: TopologyWeight;
  readonly throughputPps: number;
  readonly reliability: number;
}

export interface TopologySnapshot<N extends string = string> {
  readonly streamId: string;
  readonly nodes: readonly TopologyNode<N>[];
  readonly edges: readonly TopologyEdge<N>[];
  readonly traceId: BrandedTraceId;
  readonly routeId: LatticeRouteId;
  readonly version: `v${number}`;
  readonly windowId?: LatticeWindowId;
}

export type NodeByKind<TNodes extends readonly TopologyNode[], K extends string> = Extract<
  TNodes[number],
  { kind: K }
>;

export type AdjacentNode<TNodes extends readonly TopologyNode[]> = {
  [K in TNodes[number] as K['id']]: readonly TopologyEdge[];
};

export type RouteTuple<T extends readonly string[]> =
  T extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? readonly [H, ...RouteTuple<R>]
    : readonly [];

export type RouteFingerprint<T extends readonly string[]> =
  T extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? `${H}${R extends readonly [] ? '' : `->${RouteFingerprint<R>}`}`
    : '';

export const toNodeId = (kind: string, namespace: string, index: number): Brand<string, `topology-node:${string}`> => {
  return withBrand(`${kind}:${namespace}:${index}`, `topology-node:${kind}`);
};

export const toRouteId = (parts: readonly string[]): LatticeRouteId => {
  const route = parts.filter(Boolean).join('>');
  return asRouteId(route ? `route:${route}` : 'route:empty');
};

export const makeWindowId = (streamId: string, version: number): LatticeWindowId => {
  return asWindowId(`window:${streamId}:${version}`);
};

export const normalizeWeight = (value: number): TopologyWeight => {
  const clamped = Math.max(0, Math.min(5, Math.round(value)));
  return clamped as TopologyWeight;
};

const byNodeId = <N extends readonly TopologyNode[]>(nodes: N) => {
  const entries = new Map<string, N[number]>();
  for (const node of nodes) {
    entries.set(node.id as string, node);
  }
  return entries;
};

export const buildTopologyFingerprint = <TNodes extends readonly TopologyNode[], TEdges extends readonly TopologyEdge[]>(
  nodes: TNodes,
  edges: TEdges,
): string => {
  const signatures = [
    ...nodes.map((node) => `${node.id}:${node.kind}:${node.capacity}`),
    ...edges.map((edge) => `${edge.from}-${edge.to}:${edge.latencyMs}`),
  ];
  return signatures.sort().join('|');
};

export const hydrateTopology = <
  TNodes extends readonly TopologyNode[],
  TEdges extends readonly TopologyEdge[],
>(
  nodes: TNodes,
  edges: TEdges,
): TopologySnapshot<TNodes[number]['kind']> => {
  const routeId = toRouteId(nodes.map((node) => node.id as string));
  const traceId = withBrand(`trace:${routeId}:${nodes.length}:${edges.length}`, 'lattice-trace-id');
  const version = `v${Math.max(1, nodes.length + edges.length)}` as `v${number}`;
  return {
    streamId: `${nodes.length}-${edges.length}`,
    nodes,
    edges,
    traceId,
    routeId,
    version,
    windowId: makeWindowId(`${nodes.length}-${edges.length}`, nodes.length + edges.length),
  };
};

export const projectTopology = <T extends Record<string, unknown>>(
  snapshot: T,
  keys: readonly (keyof T)[],
): readonly Pick<T, typeof keys[number]>[] => {
  const partial: Partial<Pick<T, typeof keys[number]>> = {};
  for (const key of keys) {
    partial[key] = snapshot[key];
  }
  return [partial as Pick<T, typeof keys[number]>];
};

export const routeFromContext = (
  context: NoInfer<LatticeContext>,
  route: readonly string[],
): RouteFingerprint<RouteTuple<readonly string[]>> => {
  const zone: string = asZoneId(context.zoneId) as string;
  const base = `${context.regionId as string}>${zone}>${route.join('>')}` as RouteFingerprint<RouteTuple<readonly string[]>>;
  return base;
};

export function* traverseTopology<TNodes extends readonly TopologyNode[], TEdges extends readonly TopologyEdge[]>(
  snapshot: TopologySnapshot<TNodes[number]['kind']>,
): IterableIterator<TNodes[number]['id'] | TEdges[number]['to']> {
  const adjacency = byNodeId(snapshot.nodes);
  for (const node of snapshot.nodes) {
    yield node.id;
  }
  for (const edge of snapshot.edges) {
    const source = adjacency.get(edge.from as string);
    if (source) {
      yield edge.from;
    }
    yield edge.to;
  }
}

export const dedupeTopology = <
  TNodes extends readonly TopologyNode[],
  TEdges extends readonly TopologyEdge[],
>(
  snapshot: TopologySnapshot<TNodes[number]['kind']>,
  comparator?: (left: string, right: string) => number,
): TopologySnapshot<TNodes[number]['kind']> => {
  const nodes = [...snapshot.nodes];
  const edges = [...snapshot.edges];
  const nodeMap = new Map<string, number>(nodes.map((node, index) => [node.id as string, index]));

  const canonicalNodes = nodes
    .map((node) => ({
      ...node,
      id: withBrand(node.id as string, `topology-node:${node.kind}`),
    }))
    .toSorted((left, right) => {
      return comparator ? comparator(left.id as string, right.id as string) : left.id > right.id ? 1 : -1;
    });

  const seenEdges = new Set<string>();
  const canonicalEdges = edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}`;
    if (seenEdges.has(key)) {
      return false;
    }
    if (!nodeMap.has(edge.from as string) || !nodeMap.has(edge.to as string)) {
      return false;
    }
    seenEdges.add(key);
    return true;
  });

  return {
    ...snapshot,
    nodes: canonicalNodes,
    edges: canonicalEdges,
    routeId: toRouteId([...canonicalNodes.map((node) => node.id as string)]),
    traceId: withBrand(`trace:${snapshot.traceId}-${canonicalEdges.length}`, 'lattice-trace-id'),
    version: `v${canonicalNodes.length + canonicalEdges.length}` as `v${number}`,
    windowId: makeWindowId(`${canonicalNodes.length}-${canonicalEdges.length}`, canonicalNodes.length + canonicalEdges.length),
  };
};

export const enrichTopology = <T extends TopologySnapshot>(snapshot: T): Optionalize<T, 'version'> & { routePath: LatticeRouteId } => {
  return {
    ...snapshot,
    routePath: toRouteId([snapshot.streamId, `${snapshot.version}`]),
  };
};

