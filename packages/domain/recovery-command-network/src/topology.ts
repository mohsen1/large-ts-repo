import type { CommandNetworkNode, CommandNetworkEdge, CommandGraph, CommandNetworkNodeId, NodeRole } from './types';

const roleSequence: readonly NodeRole[] = ['ingest', 'plan', 'simulate', 'execute', 'audit'];

export const computeRoleCounts = (nodes: readonly CommandNetworkNode[]) => {
  const counts = Object.fromEntries(roleSequence.map((role) => [role, 0])) as Record<NodeRole, number>;
  for (const node of nodes) {
    counts[node.role] += 1;
  }
  return counts;
};

export const isNodeReachable = (graph: CommandGraph, start: CommandNetworkNodeId, target: CommandNetworkNodeId): boolean => {
  if (start === target) {
    return true;
  }

  const seen = new Set<CommandNetworkNodeId>([start]);
  const queue: CommandNetworkNodeId[] = [start];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    const edges = graph.adjacency[next] ?? [];
    for (const edge of edges) {
      const candidate = edge.to;
      if (candidate === target) {
        return true;
      }
      if (!seen.has(candidate)) {
        seen.add(candidate);
        queue.push(candidate);
      }
    }
  }

  return false;
};

export const buildRoleIndex = (nodes: readonly CommandNetworkNode[]) => {
  const result = {
    ingest: [] as CommandNetworkNodeId[],
    plan: [] as CommandNetworkNodeId[],
    simulate: [] as CommandNetworkNodeId[],
    execute: [] as CommandNetworkNodeId[],
    audit: [] as CommandNetworkNodeId[],
  };

  for (const node of nodes) {
    const bucket = result[node.role];
    result[node.role] = [...bucket, node.nodeId];
  }

  return result;
};

export const validateGraphStructure = (graph: CommandGraph): { ok: boolean; errors: string[] } => {
  const errors: string[] = [];
  const totalNodes = Object.values(graph.nodesByRole).reduce((acc, nodes) => acc + nodes.length, 0);

  if (totalNodes === 0) {
    errors.push('graph has no nodes');
  }

  for (const [source, edges] of Object.entries(graph.adjacency) as [CommandNetworkNodeId, readonly CommandNetworkEdge[]][]) {
    if (edges.length === 0) {
      continue;
    }

    for (const edge of edges) {
      if (!graph.adjacency[edge.to] && edge.to !== source) {
        errors.push(`edge ${edge.edgeId} references unknown target ${edge.to}`);
      }
      if (edge.confidence < 0 || edge.confidence > 1) {
        errors.push(`edge ${edge.edgeId} confidence out of bounds`);
      }
      if (edge.policyWeight < 0 || edge.policyWeight > 1) {
        errors.push(`edge ${edge.edgeId} policy weight out of bounds`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

export const criticalPath = (graph: CommandGraph, start: CommandNetworkNodeId): CommandNetworkNodeId[] => {
  const order: CommandNetworkNodeId[] = [];
  const visited = new Set<CommandNetworkNodeId>();

  const walk = (nodeId: CommandNetworkNodeId): void => {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    const edges = graph.adjacency[nodeId] ?? [];
    const ordered = [...edges].sort((left, right) => right.policyWeight - left.policyWeight);
    for (const edge of ordered) {
      walk(edge.to);
    }
    order.push(nodeId);
  };

  walk(start);
  return order.reverse();
};

export const formatGraphSummary = (graph: CommandGraph | null): string => {
  if (!graph) {
    return 'No graph';
  }

  const totalNodes = Object.values(graph.nodesByRole).reduce((acc, nodes) => acc + nodes.length, 0);
  const totalEdges = Object.values(graph.adjacency).reduce((acc, edges) => acc + edges.length, 0);
  const roleCounts = {
    ingest: graph.nodesByRole.ingest.length,
    plan: graph.nodesByRole.plan.length,
    simulate: graph.nodesByRole.simulate.length,
    execute: graph.nodesByRole.execute.length,
    audit: graph.nodesByRole.audit.length,
  };
  const topRole = roleSequence.reduce((best, role) => {
    return roleCounts[role] > roleCounts[best] ? role : best;
  }, roleSequence[0]);

  return `${totalNodes} nodes, ${totalEdges} edges, dominant role=${topRole}`;
};
