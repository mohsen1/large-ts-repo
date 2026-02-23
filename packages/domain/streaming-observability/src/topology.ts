import { Edge, NodeId, Graph } from '@shared/core';
import { StreamTopologyAlert } from './types';

export interface ObservabilityNode {
  id: NodeId;
  label: string;
  owner: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface ObservabilityEdge {
  from: NodeId;
  to: NodeId;
  throughputWeight: number;
  isEncrypted: boolean;
}

export interface TopologyGraph {
  streamId: string;
  nodes: ObservabilityNode[];
  edges: ObservabilityEdge[];
}

export const toSharedGraph = (topology: TopologyGraph): Graph<NodeId, ObservabilityEdge> => ({
  nodes: topology.nodes.map((node) => node.id),
  edges: topology.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    weight: edge.throughputWeight,
    payload: edge,
  })),
});

export const criticalityScore = (node: ObservabilityNode): number => {
  switch (node.criticality) {
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
    case 'critical':
      return 4;
    default:
      return 0;
  }
};

export const rankNodes = (nodes: readonly ObservabilityNode[]): ReadonlyArray<ObservabilityNode> =>
  [...nodes].sort((a, b) => criticalityScore(b) - criticalityScore(a));

export const buildEdgeMap = (edges: readonly ObservabilityEdge[]): Record<string, string[]> => {
  const bucket: Record<string, string[]> = {};
  for (const edge of edges) {
    const key = String(edge.from);
    const next = [...(bucket[key] ?? []), String(edge.to)];
    bucket[key] = next;
  }
  return bucket;
};

export const detectCycles = (nodes: readonly ObservabilityNode[], edges: readonly ObservabilityEdge[]): boolean => {
  const adjacency = buildEdgeMap(edges);
  const visited = new Set<string>();
  const stack = new Set<string>();

  const walk = (nodeId: string): boolean => {
    if (stack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    stack.add(nodeId);
    for (const next of adjacency[nodeId] ?? []) {
      if (walk(next)) return true;
    }
    stack.delete(nodeId);
    return false;
  };

  for (const node of nodes) {
    if (walk(node.id)) return true;
  }
  return false;
};

export const validateTopology = (topology: TopologyGraph): StreamTopologyAlert[] => {
  const alerts: StreamTopologyAlert[] = [];
  const edgeMap = buildEdgeMap(topology.edges);
  if (topology.nodes.length > 1000) {
    alerts.push({
      nodeId: 'graph-scale',
      code: 'TOP-01',
      message: 'Large node count increases backpressure risk',
      severity: 2,
    });
  }
  if (detectCycles(topology.nodes, topology.edges)) {
    alerts.push({
      nodeId: 'graph-cycle',
      code: 'TOP-02',
      message: 'Topology cycle detected',
      severity: 4,
    });
  }
  for (const node of topology.nodes) {
    const outDegree = edgeMap[node.id]?.length ?? 0;
    if (outDegree === 0) {
      alerts.push({
        nodeId: String(node.id),
        code: 'TOP-03',
        message: 'Sink-like node with no outbound edge',
        severity: 2,
      });
    }
  }
  return alerts;
};
