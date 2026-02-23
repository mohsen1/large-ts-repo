import type { ContinuityTopologyEdge, ContinuityTopologyNode, ReadonlyRecord } from './types';

export interface TopologySummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly meanDegree: number;
  readonly criticalChains: number;
  readonly adjacency: ReadonlyRecord<string, ReadonlyArray<string>>;
}

export interface TopologyPath {
  readonly from: string;
  readonly to: string;
  readonly hops: ReadonlyArray<string>;
}

export interface TopologyMetrics {
  readonly maxFanOut: number;
  readonly minFanOut: number;
  readonly disconnectedNodes: number;
}

const buildAdjacency = (nodes: ReadonlyArray<ContinuityTopologyNode>, edges: ReadonlyArray<ContinuityTopologyEdge>) => {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.nodeId, []);
  }
  for (const edge of edges) {
    const fromBucket = adjacency.get(edge.from);
    if (!fromBucket) {
      continue;
    }
    fromBucket.push(edge.to);
    if (!edge.directed) {
      const reverseBucket = adjacency.get(edge.to);
      if (reverseBucket) {
        reverseBucket.push(edge.from);
      }
    }
  }
  return adjacency;
};

export const summarizeTopology = (nodes: ReadonlyArray<ContinuityTopologyNode>, edges: ReadonlyArray<ContinuityTopologyEdge>): TopologySummary => {
  const adjacency = buildAdjacency(nodes, edges);
  const degrees = [...adjacency.values()].map((targets) => targets.length);
  const totalDegree = degrees.reduce((acc, value) => acc + value, 0);
  const criticalChains = edges.filter((edge) => edge.strength < 0.25).length;

  const meanDegree = nodes.length > 0 ? totalDegree / nodes.length : 0;

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    meanDegree,
    criticalChains,
    adjacency: Object.fromEntries([...adjacency.entries()].map(([source, targets]) => [source, [...targets]])),
  };
};

export const computePaths = (
  source: string,
  destination: string,
  nodes: ReadonlyArray<ContinuityTopologyNode>,
  edges: ReadonlyArray<ContinuityTopologyEdge>,
): TopologyPath[] => {
  const nodeIndex = new Set(nodes.map((node) => node.nodeId));
  const adjacency = buildAdjacency(nodes, edges);
  const queue: { node: string; hops: string[] }[] = [{ node: source, hops: [source] }];
  const found: TopologyPath[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) {
      continue;
    }
    if (!nodeIndex.has(entry.node)) {
      continue;
    }
    if (entry.node === destination && entry.hops.length > 1) {
      found.push({ from: source, to: destination, hops: [...entry.hops] });
      continue;
    }
    if (visited.has(entry.node)) {
      continue;
    }
    visited.add(entry.node);
    for (const next of adjacency.get(entry.node) ?? []) {
      if (!entry.hops.includes(next)) {
        queue.push({ node: next, hops: [...entry.hops, next] });
      }
    }
  }

  return found;
};

export const summarizeMetrics = (nodes: ReadonlyArray<ContinuityTopologyNode>, edges: ReadonlyArray<ContinuityTopologyEdge>): TopologyMetrics => {
  const adjacency = buildAdjacency(nodes, edges);
  const degrees = [...adjacency.values()].map((targets) => targets.length);
  const maxFanOut = degrees.length > 0 ? Math.max(...degrees) : 0;
  const minFanOut = degrees.length > 0 ? Math.min(...degrees) : 0;
  const disconnectedNodes = [...adjacency.values()].reduce((count, targets) => (targets.length === 0 ? count + 1 : count), 0);
  return { maxFanOut, minFanOut, disconnectedNodes };
};
