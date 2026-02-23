import { type HubEdge, type HubNode, type HubTopology, type HubNodeId, type HubRunId, brandEdgeId } from './types';

export interface TopologyMap {
  readonly runId: HubRunId;
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
}

export const buildTopology = (nodes: readonly HubNode[], edges: readonly HubEdge[] = []): HubTopology => ({
  nodes: [...nodes],
  edges: [...edges],
  nodeIds: computeTopologicalOrder(nodes, edges),
  topologyVersion: 1,
});

export const buildDependencyMap = (topology: HubTopology): TopologyMap => {
  const map = new Map<string, string[]>();
  for (const node of topology.nodes) {
    map.set(node.id, []);
  }
  for (const edge of topology.edges) {
    const next = map.get(edge.to) ?? [];
    map.set(edge.to, [...next, edge.from]);
  }

  return {
    runId: topology.nodes[0] ? (topology.nodes[0].id as any as HubRunId) : ('' as HubRunId),
    adjacency: map,
  };
};

export const addDependency = (topology: HubTopology, from: HubNodeId, to: HubNodeId, reason: string): HubTopology => {
  const edge: HubEdge = {
    id: brandEdgeId(`${from}-${to}-${Date.now()}`),
    from,
    to,
    latencyMs: 120,
    constraint: {
      type: 'precedence',
      reason,
      owner: 'planner',
    },
  };
  const nextEdges = [...topology.edges, edge];
  return {
    ...topology,
    edges: nextEdges,
    nodeIds: computeTopologicalOrder(topology.nodes, nextEdges),
    topologyVersion: topology.topologyVersion + 1,
  };
};

export const removeDependency = (topology: HubTopology, from: HubNodeId, to: HubNodeId): HubTopology => {
  const next = topology.edges.filter((edge) => edge.from !== from || edge.to !== to);
  return {
    ...topology,
    edges: next,
    nodeIds: computeTopologicalOrder(topology.nodes, next),
    topologyVersion: topology.topologyVersion + 1,
  };
};

const computeTopologicalOrder = (nodes: readonly HubNode[], edges: readonly HubEdge[]): readonly HubNodeId[] => {
  const blocked = new Set<string>();
  for (const edge of edges) {
    blocked.add(edge.to);
  }

  const root = nodes
    .filter((node) => !blocked.has(node.id))
    .map((node) => node.id);
  const rest = nodes
    .filter((node) => blocked.has(node.id))
    .map((node) => node.id)
    .filter((nodeId) => !root.includes(nodeId));

  return [...root, ...rest];
};

export { computeTopologicalOrder };
