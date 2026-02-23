import { Graph, NodeId } from '@shared/core';
import {
  WorkloadTopology,
  WorkloadTopologyEdge,
  WorkloadTopologyNode,
  WorkloadTarget,
  RecoverySignal,
  SeverityBand,
} from './models';

export type DependencyPath = readonly WorkloadTopologyNode[];

export interface NodeExposure {
  readonly nodeId: NodeId;
  readonly outgoing: number;
  readonly incoming: number;
  readonly isolationRisk: number;
}

export interface TopologyLayer {
  readonly layer: number;
  readonly workloadIds: readonly NodeId[];
}

export interface TopologyPath {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly hops: number;
}

export interface TopologyHealth {
  readonly tenantId: WorkloadTopology['tenantId'];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly maxInDegree: number;
  readonly maxOutDegree: number;
  readonly dependencyDepth: number;
  readonly hasCycle: boolean;
  readonly criticalFanIn: readonly NodeId[];
}

export interface TopologyQuery {
  readonly tenantId: WorkloadTopology['tenantId'];
  readonly includeDormant: boolean;
}

const UNKNOWN_TENANT = 'unknown-tenant';

const compareNodeId = (left: NodeId, right: NodeId): number => {
  return String(left).localeCompare(String(right));
};

const safeCriticality = (candidate: WorkloadTopologyNode, fallback: number): number => {
  return Number.isFinite(candidate.criticality) ? candidate.criticality : fallback;
};

const computeDegrees = (topology: WorkloadTopology): Map<NodeId, { incoming: number; outgoing: number }> => {
  const map = new Map<NodeId, { incoming: number; outgoing: number }>();
  for (const node of topology.nodes) {
    map.set(node.id, { incoming: 0, outgoing: 0 });
  }
  for (const edge of topology.edges) {
    const upstream = map.get(edge.from) ?? { incoming: 0, outgoing: 0 };
    const downstream = map.get(edge.to) ?? { incoming: 0, outgoing: 0 };
    upstream.outgoing += 1;
    downstream.incoming += 1;
    map.set(edge.from, upstream);
    map.set(edge.to, downstream);
  }
  return map;
};

export const mapNodeExposure = (topology: WorkloadTopology): readonly NodeExposure[] => {
  const degrees = computeDegrees(topology);
  const result: NodeExposure[] = [];
  let highestCriticality = 0;

  for (const node of topology.nodes) {
    highestCriticality = Math.max(highestCriticality, safeCriticality(node, 0));
  }

  for (const [nodeId, degree] of degrees) {
    const risk = highestCriticality === 0 ? 0 : (degree.incoming + degree.outgoing) / highestCriticality;
    result.push({
      nodeId,
      incoming: degree.incoming,
      outgoing: degree.outgoing,
      isolationRisk: risk,
    });
  }

  return result.sort((left, right) => {
    if (left.isolationRisk === right.isolationRisk) return compareNodeId(left.nodeId, right.nodeId);
    return right.isolationRisk - left.isolationRisk;
  });
};

const outgoingNodes = (edges: readonly WorkloadTopologyEdge[], nodeId: NodeId): readonly NodeId[] => {
  return edges.filter((edge) => edge.from === nodeId).map((edge) => edge.to);
};

const detectCycles = (topology: WorkloadTopology): readonly TopologyPath[] => {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: TopologyPath[] = [];
  const edgesByFrom = new Map<NodeId, ReadonlyArray<NodeId>>();

  for (const node of topology.nodes) {
    edgesByFrom.set(node.id, outgoingNodes(topology.edges, node.id));
  }

  const dfs = (nodeId: NodeId, start: NodeId, hops: number, path: NodeId[]) => {
    if (stack.has(nodeId)) {
      const cycle = path.slice(path.indexOf(nodeId));
      const to = cycle[cycle.length - 1];
      const from = cycle[0];
      cycles.push({ from, to, hops: cycle.length });
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    stack.add(nodeId);
    const nextNodes = edgesByFrom.get(nodeId) ?? [];
    for (const next of nextNodes) {
      dfs(next, start, hops + 1, [...path, next]);
    }
    stack.delete(nodeId);
  };

  for (const node of topology.nodes) {
    dfs(node.id, node.id, 0, [node.id]);
  }

  return cycles;
};

export const evaluateTopology = (topology: WorkloadTopology): TopologyHealth => {
  const query = normalizeTopology(topology);
  const edges = query.edges;
  const degrees = computeDegrees(query);
  let maxIn = 0;
  let maxOut = 0;
  let depth = 0;

  for (const stats of degrees.values()) {
    maxIn = Math.max(maxIn, stats.incoming);
    maxOut = Math.max(maxOut, stats.outgoing);
    depth = Math.max(depth, stats.incoming + stats.outgoing);
  }

  const cycleScan = detectCycles(query);
  const exposures = mapNodeExposure(query);
  const criticalFanIn = exposures
    .filter((entry) => entry.incoming > 0 && entry.isolationRisk > 1.2)
    .map((entry) => entry.nodeId);

  return {
    tenantId: query.tenantId ?? UNKNOWN_TENANT,
    nodeCount: query.nodes.length,
    edgeCount: query.edges.length,
    maxInDegree: maxIn,
    maxOutDegree: maxOut,
    dependencyDepth: depth,
    hasCycle: cycleScan.length > 0,
    criticalFanIn,
  };
};

export const normalizeTopology = (topology: WorkloadTopology): WorkloadTopology => {
  const nodesById = new Map<string, WorkloadTopologyNode>();
  for (const node of topology.nodes) {
    nodesById.set(node.id, {
      ...node,
      id: node.id,
      name: node.name.trim(),
      criticality: Math.max(1, Math.min(5, safeCriticality(node, 1))) as WorkloadTopologyNode['criticality'],
      active: Boolean(node.active),
    });
  }

  const edges = topology.edges
    .filter((edge) => nodesById.has(edge.from) && nodesById.has(edge.to))
    .map((edge) => ({
      ...edge,
      coupling: Math.max(0.01, Math.min(1, edge.coupling)),
      reason: edge.reason.trim().length > 0 ? edge.reason : 'inferred',
    }));

  return {
    tenantId: topology.tenantId ?? UNKNOWN_TENANT,
    nodes: [...nodesById.values()],
    edges,
  };
};

export const buildLayers = (topology: WorkloadTopology): readonly TopologyLayer[] => {
  const normalized = normalizeTopology(topology);
  const nodeMap = new Map<NodeId, WorkloadTopologyNode>();
  const inDegree = new Map<NodeId, number>();

  for (const node of normalized.nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
  }

  for (const edge of normalized.edges) {
    const count = inDegree.get(edge.to) ?? 0;
    inDegree.set(edge.to, count + 1);
  }

  const layers: TopologyLayer[] = [];
  const ready = [...inDegree.entries()]
    .filter(([, value]) => value === 0)
    .map(([nodeId]) => nodeId)
    .sort(compareNodeId);

  let queue: NodeId[] = [...ready];
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const edge of normalized.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }

  const consumed = new Set<NodeId>();
  let layer = 0;
  while (queue.length > 0) {
    layers.push({ layer, workloadIds: [...queue as NodeId[]].sort(compareNodeId) });

        const nextLevel: NodeId[] = [];
    for (const current of queue) {
      consumed.add(current);
      const nextNodes = adjacency.get(current) ?? [];
      for (const next of nextNodes) {
        if (consumed.has(next)) continue;
        const pending = (inDegree.get(next) ?? 0) - 1;
        inDegree.set(next, pending);
      if (pending <= 0) {
        nextLevel.push(next);
      }
      }
    }
    queue = [...new Set(nextLevel)].sort(compareNodeId);
    layer += 1;
  }

  const remaining = [...inDegree.entries()].filter(([, count]) => count > 0).map(([nodeId]) => nodeId);
  if (remaining.length > 0) {
    layers.push({
      layer,
      workloadIds: remaining.sort(compareNodeId),
    });
  }

  return layers;
};

export const shortestImpactPath = (
  topology: WorkloadTopology,
  root: NodeId,
  signals: readonly RecoverySignal[],
): DependencyPath => {
  const normalized = normalizeTopology(topology);
  const severityScore = Math.max(...signals.map((signal) => signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1), 1);

  const adjacency = new Map<string, NodeId[]>();
  for (const edge of normalized.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }

  const visited = new Set<NodeId>();
  const queue: { nodeId: NodeId; path: NodeId[]; depth: number }[] = [{ nodeId: root, path: [root], depth: 0 }];
  let bestPath: NodeId[] = [root];
  const targetDepth = Math.max(1, Math.min(6, severityScore));

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) continue;
    if (entry.depth >= targetDepth) continue;
    if (visited.has(entry.nodeId)) continue;

    visited.add(entry.nodeId);
    const nextNodes = adjacency.get(entry.nodeId) ?? [];
    for (const next of nextNodes) {
      const nextPath = [...entry.path, next];
      if (nextPath.length > bestPath.length) bestPath = nextPath;
      queue.push({ nodeId: next, path: nextPath, depth: entry.depth + 1 });
    }
  }

  const lookup = new Map<NodeId, WorkloadTopologyNode>();
  for (const node of normalized.nodes) {
    lookup.set(node.id, node);
  }

  return bestPath
    .filter((nodeId) => lookup.has(nodeId))
    .map((nodeId) => lookup.get(nodeId)!);
};

export const buildTopologyGraph = (topology: WorkloadTopology): Graph<NodeId, { coupling: number; reason: string }> => {
  const normalized = normalizeTopology(topology);
  return {
    nodes: normalized.nodes.map((node) => node.id),
    edges: normalized.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      weight: edge.coupling,
      payload: { coupling: edge.coupling, reason: edge.reason },
    })),
  };
};

export const inferRiskBandFromSignals = (signals: readonly RecoverySignal[]): SeverityBand => {
  const severityWeight = signals.reduce((carry, signal) => {
    if (signal.severity === 'critical') return carry + 4;
    if (signal.severity === 'high') return carry + 3;
    if (signal.severity === 'medium') return carry + 2;
    return carry + 1;
  }, 0);
  const normalized = Math.max(1, signals.length === 0 ? 1 : severityWeight / signals.length);

  if (normalized >= 3.5) return 'critical';
  if (normalized >= 2.8) return 'high';
  if (normalized >= 2) return 'medium';
  return 'low';
};

export const mapTargetsToNodes = (targets: readonly WorkloadTarget[]): WorkloadTopology => {
  const seen = new Set<NodeId>();
  const nodes: WorkloadTopologyNode[] = [];
  const edges: WorkloadTopologyEdge[] = [];
  for (const target of targets) {
    if (!seen.has(target.workloadId)) {
      seen.add(target.workloadId);
      nodes.push({
        id: target.workloadId,
        name: target.name,
        ownerTeam: 'workload-owner',
        criticality: target.criticality,
        active: true,
      });
    }
    for (const dependency of target.dependencies) {
      edges.push({
        from: dependency,
        to: target.workloadId,
        coupling: 0.45,
        reason: `dependency of ${target.name}`,
      });
    }
  }

  return {
    tenantId: targets[0]?.tenantId ?? UNKNOWN_TENANT,
    nodes,
    edges,
  };
};
