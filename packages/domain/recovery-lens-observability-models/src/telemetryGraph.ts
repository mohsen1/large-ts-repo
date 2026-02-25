import { partitionBy, uniqueBy } from '@shared/typed-orchestration-core';
import { mapWithIteratorHelpers } from '@shared/type-level';
import type { ObserverNamespace, ObserverAgentId } from './contracts';

export type LensTopologyNode = {
  readonly id: ObserverAgentId;
  readonly namespace: ObserverNamespace;
  readonly labels: Readonly<Record<string, string>>;
};

export type LensTopologyEdge = {
  readonly from: ObserverAgentId;
  readonly to: ObserverAgentId;
  readonly weight: number;
};

export type LensTopology = {
  readonly nodes: readonly LensTopologyNode[];
  readonly edges: readonly LensTopologyEdge[];
};

export type TopologyMap = LensTopology;

export type TopologySummary = {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly averageWeight: number;
};

export const nodeFromNamespace = (namespace: ObserverNamespace): LensTopologyNode => ({
  id: `agent:${namespace}` as ObserverAgentId,
  namespace,
  labels: {
    source: 'lens',
  },
});

export const makeTopology = <
  TNodes extends readonly LensTopologyNode[],
  TEdges extends readonly LensTopologyEdge[],
>(nodes: TNodes, edges: TEdges): LensTopology => ({
  nodes,
  edges,
});

export const normalizeTopology = (topology: LensTopology): LensTopology => ({
  nodes: topology.nodes.map((node) => ({ ...node, labels: { ...node.labels } })),
  edges: topology.edges.map((edge) => ({ ...edge, weight: Math.max(0, edge.weight) })),
});

export const summarizeTopology = (topology: LensTopology): TopologySummary => {
  const total = topology.edges.reduce((acc, edge) => acc + edge.weight, 0);
  return {
    nodeCount: topology.nodes.length,
    edgeCount: topology.edges.length,
    averageWeight: topology.edges.length === 0 ? 0 : total / topology.edges.length,
  };
};

export const topologyByNamespace = (topology: LensTopology): ReadonlyMap<ObserverNamespace, readonly LensTopologyEdge[]> => {
  return new Map(
    topology.nodes.map(
      (node) => [
        node.namespace,
        topology.edges.filter((edge) => edge.from === node.id || edge.to === node.id),
      ] as const,
    ),
  );
};

export const routeNodes = (topology: LensTopology): readonly string[] => {
  return topology.nodes.map((node, index) => `${index}:${node.id}`);
};

export const topologyIndex = (topology: LensTopology): ReadonlyMap<string, readonly LensTopologyNode[]> => {
  return partitionBy(topology.nodes, (node) => node.namespace);
};

export const topologyByWindow = (topology: LensTopology): ReadonlyMap<`route:${string}`, string[]> => {
  const out = new Map<`route:${string}`, string[]>();
  for (const node of topology.nodes) {
    const key = `route:${String(node.namespace).replace(/^namespace:/, 'namespace-')}` as `route:${string}`;
    const list = out.get(key) ?? [];
    list.push(node.id);
    out.set(key, list);
  }
  return out;
};

export const buildSampleTopology = (namespace: ObserverNamespace): LensTopology => {
  const root = nodeFromNamespace(namespace);
  const worker = nodeFromNamespace(`${namespace}-worker` as ObserverNamespace);
  const edge = { from: root.id, to: worker.id, weight: 1 };
  return makeTopology([root, worker], [edge]);
};

export const isolatedNodes = (topology: LensTopology): readonly ObserverAgentId[] => {
  const touched = new Set(topology.edges.flatMap((edge) => [edge.from, edge.to]));
  return uniqueBy(topology.nodes, (node) => node.id)
    .filter((node) => !touched.has(node.id))
    .map((node) => node.id);
};

export const sampleTopologyPolicy = (namespace: ObserverNamespace): string => {
  return `policy:${String(namespace).replace(':', '-')}`;
};
