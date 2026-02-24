import { rankByScore } from '@shared/util';
import type {
  ConstellationNode,
  ConstellationTimelineEdge,
  ConstellationTopology,
  ConstellationStage,
} from './ids';

export type TopologyKey = `${string}-${string}`;
export type TopologyEdgeList<T extends ConstellationTimelineEdge[] = ConstellationTimelineEdge[]> = readonly [...T];

export type NodeById<TNodes extends readonly ConstellationNode[], TTarget extends string> = Extract<
  TNodes[number],
  { readonly nodeId: TTarget }
>;

export type NeighborTable<TEdges extends readonly ConstellationTimelineEdge[]> = {
  readonly [K in TEdges[number] as K['from']]: readonly K['to'][];
};

export type StageSequence<T extends readonly ConstellationStage[], TIndex extends number = 0> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends ConstellationStage
      ? readonly [
          Head,
          ...(Tail extends readonly ConstellationStage[] ? StageSequence<Tail, TIndex> : readonly []),
        ]
      : readonly []
    : readonly [];

export type StageFingerprint<T extends readonly ConstellationStage[]> = T extends readonly []
  ? 'void'
  : T extends readonly [infer Head, ...infer Tail]
    ? Head extends ConstellationStage
      ? Tail extends readonly ConstellationStage[]
        ? `${Head}.${StageFingerprint<Tail>}`
        : `${Head}.void`
      : never
    : 'void';

export type RecursiveDepthTuples<
  TItems extends readonly unknown[],
  TDepth extends number,
  TAcc extends readonly unknown[] = readonly [],
> = TAcc['length'] extends TDepth
  ? TAcc
  : TItems extends readonly [...TAcc, infer TCurrent]
    ? RecursiveDepthTuples<TItems, TDepth, readonly [...TAcc, TCurrent]>
    : TAcc;

export type TopologyRoute<T extends ConstellationTopology, TDepth extends number = 12> = {
  readonly path: StageSequence<T['nodes'] extends readonly ConstellationNode[] ? ['bootstrap', ...ConstellationStage[]] : readonly ConstellationStage[]>;
  readonly fingerprint: StageFingerprint<T['nodes'] extends readonly ConstellationNode[] ? T['nodes']['length'] extends 0 ? [] : ['bootstrap'] : []>;
  readonly steps: TDepth;
};

const edgeByFrom = (edges: readonly ConstellationTimelineEdge[]): ReadonlyMap<string, readonly string[]> =>
  new Map(
    edges
      .map((edge): readonly [string, string] => [edge.from, edge.to])
      .reduce<Array<readonly [string, string]>>((acc, [from, to]) => {
      acc.push([from, to]);
      return acc;
    }, [])
      .reduce((acc, [from, to]) => {
      const current = acc.get(from) ?? [];
      acc.set(from, [...current, to]);
      return acc;
    }, new Map<string, string[]>()),
  );

const scoreDependency = (value: ConstellationTopology): number =>
  value.nodes.reduce((acc, node) => acc + node.criticality * node.actionCount, 0);

export const buildTopologyFingerprint = (topology: ConstellationTopology): string => {
  const nodeSignature = topology.nodes.map((node) => `${node.nodeId}:${node.stage}`).toSorted();
  const edgeSignature = topology.edges.map((edge) => `${edge.from}->${edge.to}`).toSorted();
  return `${nodeSignature.join('|')}:${edgeSignature.join('|')}`;
};

const sortTopology = (topology: ConstellationTopology): ConstellationTopology => ({
  nodes: topology.nodes.toSorted((left, right) => {
    if (left.criticality !== right.criticality) {
      return right.criticality - left.criticality;
    }
    return right.actionCount - left.actionCount;
  }),
  edges: topology.edges.toSorted((left, right) => left.from.localeCompare(right.from)),
});

export const topologyByCriticality = (topology: ConstellationTopology): readonly ConstellationNode[] =>
  sortTopology(topology).nodes;

export const topologyPathIndex = (topology: ConstellationTopology): ReadonlyMap<string, number> =>
  new Map(topology.nodes.map((node, index) => [node.nodeId, index] as const));

export const connectedComponents = (topology: ConstellationTopology): readonly [ConstellationNode[], ConstellationTimelineEdge[]][] => {
  void topologyPathIndex(topology);
  const seen = new Set<string>();

  const walk = (root: string): ConstellationNode[] => {
    const stack = [root];
    const visited = new Set<string>();
    const nodes: ConstellationNode[] = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      const node = topology.nodes.find((entry) => entry.nodeId === current);
      if (node) {
        nodes.push(node);
      }
      for (const edge of topology.edges) {
        if (edge.from === current && !visited.has(edge.to)) {
          stack.push(edge.to);
        }
      }
    }

    return nodes;
  };

  const groups: Array<[ConstellationNode[], ConstellationTimelineEdge[]]> = [];
  for (const node of topology.nodes) {
    if (seen.has(node.nodeId)) continue;
    const visited = walk(node.nodeId);
    if (visited.length === 0) continue;
    const index = topology.edges.filter((edge) => visited.some((left) => edge.from === left.nodeId || edge.to === left.nodeId));
    for (const found of visited) {
      seen.add(found.nodeId);
    }
    groups.push([visited, index]);
  }
  return groups;
};

export const rankNodeByDependency = (topology: ConstellationTopology): readonly ConstellationNode[] =>
  rankByScore(topology.nodes, (node) => node.criticality);

export const isValidDependency = (topology: ConstellationTopology): boolean =>
  topology.edges.every((edge) => {
    const hasFrom = topology.nodes.some((node) => node.nodeId === edge.from);
    const hasTo = topology.nodes.some((node) => node.nodeId === edge.to);
    return hasFrom && hasTo;
  });

export const buildTopologyEdgesByStage = (topology: ConstellationTopology): Readonly<Record<ConstellationStage, ConstellationTimelineEdge[]>> =>
  topology.nodes.reduce((acc, node) => ({
    ...acc,
    [node.stage]: topology.edges.filter((edge) => edge.from === node.nodeId),
  }), {} as Record<ConstellationStage, ConstellationTimelineEdge[]>);

export const topologySummary = (topology: ConstellationTopology) => {
  const sorted = topologyByCriticality(topology);
  const score = scoreDependency(topology);
  const fingerprint = buildTopologyFingerprint(topology);
  const valid = isValidDependency(topology);
  const edgesByStage = buildTopologyEdgesByStage(topology);
  const components = connectedComponents(topology);
  return {
    totalNodes: topology.nodes.length,
    totalEdges: topology.edges.length,
    score,
    valid,
    fingerprint,
    components: components.length,
    edgesByStage,
    topNode: sorted[0] ?? null,
  };
};

const normalizeByIndex = <T>(items: readonly T[]): readonly [T, number][] =>
  items.map((item, index) => [item, index] as const);

export const buildTopologyTable = (topology: ConstellationTopology): ReadonlyMap<string, readonly [number, ConstellationNode]> => {
  const entries = normalizeByIndex(topology.nodes);
  const rows = entries.map(([node, index]) => [node.nodeId, [index, node]] as const);
  return new Map(rows);
};

export const topologyDepth = (topology: ConstellationTopology): number =>
  topology.edges.reduce((acc, edge) => Math.max(acc, edge.from.length + edge.to.length), 0);
