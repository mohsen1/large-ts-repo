import type { FabricLink, FabricNode, FabricNodeId, FabricTopologyEdge, FabricTopologySnapshot } from './types';

export interface TopologyMetrics {
  readonly criticality: number;
  readonly maxLatencyMs: number;
  readonly averageLatencyMs: number;
  readonly isolatedNodeCount: number;
}

export interface LinkIndex {
  readonly bySource: Map<FabricNodeId, FabricLink[]>;
  readonly byTarget: Map<FabricNodeId, FabricLink[]>;
}

export const buildTopologyEdges = (nodes: readonly FabricNode[], links: readonly FabricLink[]): readonly FabricTopologyEdge[] => {
  const index = buildLinkIndex(links);
  const outgoing = index.bySource;
  const edges: FabricTopologyEdge[] = [];
  let edgeIndex = 0;

  for (const node of nodes) {
    const sourceEdges = outgoing.get(node.id) ?? [];
    for (const link of sourceEdges) {
      edges.push({
        from: link.from,
        to: link.to,
        edgeIndex,
        active: link.latencyMs <= 5_000,
      });
      edgeIndex += 1;
    }
  }

  return edges;
};

export const buildTopologySnapshot = (nodes: readonly FabricNode[], links: readonly FabricLink[]): FabricTopologySnapshot => {
  const edges = buildTopologyEdges(nodes, links);
  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
  };
};

export const summarizeTopology = (nodes: readonly FabricNode[], links: readonly FabricLink[]): TopologyMetrics => {
  const latencies = links.map((link) => link.latencyMs);
  const averageLatencyMs = latencies.length === 0 ? 0 : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  const maxLatencyMs = latencies.length === 0 ? 0 : Math.max(...latencies);
  const index = buildLinkIndex(links);
  const allReachable = new Set<string>(nodes.map((node) => node.id));
  for (const [source] of index.bySource) {
    allReachable.delete(source);
  }
  const isolatedNodeCount = allReachable.size;
  const criticality = nodes.reduce((sum, node) => sum + (100 - node.resilienceScore), 0) / Math.max(1, nodes.length);
  return {
    criticality: Number(criticality.toFixed(2)),
    maxLatencyMs,
    averageLatencyMs: Number(averageLatencyMs.toFixed(2)),
    isolatedNodeCount,
  };
};

const buildLinkIndex = (links: readonly FabricLink[]): LinkIndex => {
  const bySource = new Map<FabricNodeId, FabricLink[]>();
  const byTarget = new Map<FabricNodeId, FabricLink[]>();
  for (const link of links) {
    const fromBucket = bySource.get(link.from) ?? [];
    bySource.set(link.from, [...fromBucket, link]);

    const toBucket = byTarget.get(link.to) ?? [];
    byTarget.set(link.to, [...toBucket, link]);
  }
  return { bySource, byTarget };
};

export const traceDependencyPath = (
  startNodeId: FabricNodeId,
  links: readonly FabricLink[],
): readonly FabricNodeId[] => {
  const index = buildLinkIndex(links);
  const path: FabricNodeId[] = [startNodeId];
  const visited = new Set<FabricNodeId>([startNodeId]);

  let frontier: FabricNodeId[] = [startNodeId];
  while (frontier.length > 0) {
    const nextFrontier: FabricNodeId[] = [];
    for (const source of frontier) {
      for (const link of index.bySource.get(source) ?? []) {
        if (!visited.has(link.to)) {
          visited.add(link.to);
          path.push(link.to);
          nextFrontier.push(link.to);
        }
      }
    }
    frontier = nextFrontier;
  }

  return path;
};

export const selectRouteNodes = (
  scenarioNodeIds: readonly FabricNodeId[],
  targetNodeCount: number,
): readonly FabricNodeId[] => {
  return [...scenarioNodeIds]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, Math.max(1, Math.min(targetNodeCount, scenarioNodeIds.length)));
};
