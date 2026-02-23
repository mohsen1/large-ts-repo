import type { WorkloadDependencyGraph, WorkloadDependencyEdge, WorkloadNode, WorkloadUnitId } from './types';

export interface NodeTopology {
  readonly id: WorkloadUnitId;
  readonly depth: number;
  readonly inbound: number;
  readonly outbound: number;
  readonly criticality: WorkloadNode['criticality'];
}

export interface TopologyLayer {
  readonly depth: number;
  readonly nodes: readonly WorkloadNode['id'][];
}

export interface TopologyReport {
  readonly nodes: readonly NodeTopology[];
  readonly layers: readonly TopologyLayer[];
  readonly hasCycle: boolean;
  readonly orderedRoots: readonly WorkloadUnitId[];
}

const zeroNode = (node: WorkloadNode): NodeTopology => ({
  id: node.id,
  depth: 0,
  inbound: 0,
  outbound: 0,
  criticality: node.criticality,
});

const edgesByParent = (edges: readonly WorkloadDependencyEdge[]): Map<WorkloadUnitId, WorkloadUnitId[]> => {
  const grouped = new Map<WorkloadUnitId, WorkloadUnitId[]>();
  for (const edge of edges) {
    const current = grouped.get(edge.parent) ?? [];
    current.push(edge.child);
    grouped.set(edge.parent, current);
  }
  return grouped;
};

const edgesByChild = (edges: readonly WorkloadDependencyEdge[]): Map<WorkloadUnitId, number> => {
  const inbound = new Map<WorkloadUnitId, number>();
  for (const edge of edges) {
    inbound.set(edge.child, (inbound.get(edge.child) ?? 0) + 1);
  }
  return inbound;
};

const calculateDepth = (
  nodeId: WorkloadUnitId,
  outgoing: Map<WorkloadUnitId, WorkloadUnitId[]>,
  memo: Map<WorkloadUnitId, number>,
): number => {
  if (memo.has(nodeId)) {
    return memo.get(nodeId) ?? 0;
  }
  const children = outgoing.get(nodeId) ?? [];
  if (children.length === 0) {
    memo.set(nodeId, 0);
    return 0;
  }
  const depth = 1 + Math.max(...children.map((child) => calculateDepth(child, outgoing, memo)));
  memo.set(nodeId, depth);
  return depth;
};

const hasCycle = (graph: WorkloadDependencyGraph): boolean => {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    const next = adjacency.get(edge.parent) ?? [];
    next.push(edge.child);
    adjacency.set(edge.parent, next);
    indegree.set(edge.child, (indegree.get(edge.child) ?? 0) + 1);
  }
  const queue = [...indegree.entries()].filter((entry) => entry[1] === 0).map(([id]) => id);
  let processed = 0;
  while (queue.length > 0) {
    const head = queue.shift();
    if (!head) {
      continue;
    }
    processed += 1;
    for (const next of adjacency.get(head) ?? []) {
      const value = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, value);
      if (value === 0) {
        queue.push(next);
      }
    }
  }
  return processed !== indegree.size;
};

export const buildTopology = (graph: WorkloadDependencyGraph): TopologyReport => {
  const outbound = edgesByParent(graph.edges);
  const inboundCounts = edgesByChild(graph.edges);
  const depthMemo = new Map<WorkloadUnitId, number>();
  const nodes = graph.nodes.map((node) => {
    const base = zeroNode(node);
    const children = outbound.get(node.id) ?? [];
    return {
      ...base,
      inbound: inboundCounts.get(node.id) ?? 0,
      outbound: children.length,
      depth: calculateDepth(node.id, outbound, depthMemo),
    };
  });
  const layers: Record<number, WorkloadUnitId[]> = {};
  for (const topologyNode of nodes) {
    const bucket = layers[topologyNode.depth] ?? [];
    bucket.push(topologyNode.id);
    layers[topologyNode.depth] = bucket;
  }
  const orderedRoots = [...graph.nodes]
    .filter((node) => !graph.edges.some((edge) => edge.child === node.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => node.id);

  return {
    nodes,
    layers: Object.entries(layers)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([depth, ids]) => ({
        depth: Number(depth),
        nodes: ids,
      })),
    hasCycle: hasCycle(graph),
    orderedRoots,
  };
};

export const buildCriticalChain = (graph: WorkloadDependencyGraph, criticalityFloor: WorkloadNode['criticality']): readonly WorkloadNode[] => {
  return graph.nodes
    .filter((node) => node.criticality >= criticalityFloor)
    .sort((left, right) => right.criticality - left.criticality || left.name.localeCompare(right.name));
};
