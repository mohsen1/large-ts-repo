import { randomUUID } from 'node:crypto';
import {
  createNavigator,
  type MeshTopology,
  type MeshTopologyPath,
  type MeshTopologyEdge,
  type MeshNodeContract,
} from '@domain/recovery-ops-mesh';

export interface MeshTopologyStats {
  readonly nodes: number;
  readonly links: number;
  readonly maxDepth: number;
  readonly maxBatch: number;
  readonly sampleRate: number;
  readonly signature: string;
}

export interface MeshRuntimePath {
  readonly token: string;
  readonly keys: MeshTopologyPath[];
}

export interface MeshTopologyServiceState {
  visited: number;
  skipped: number;
}

export const createTopologyFromSignal = (topology: MeshTopology, selectedKind: string): MeshTopologyPath[] => {
  const navigator = createNavigator(topology.nodes);
  const start = topology.nodes[0]?.id;
  if (!start) {
    return [];
  }

  const seen = new Set<MeshTopologyPath>();
  const stack: MeshTopologyPath[] = [start as MeshTopologyPath];

  while (stack.length > 0) {
    const current = stack.pop() as MeshTopologyPath;
    seen.add(current);

    for (const edge of topology.links) {
      if (edge.from === current && edge.channels.includes(`mesh-signal:${selectedKind}`)) {
        stack.push(edge.to as MeshTopologyPath);
      }
    }
  }

  return [...seen];
};

export const describeTopology = (topology: MeshTopology): MeshTopologyStats => {
  const navigator = createNavigator(topology.nodes);
  const nodes = [...navigator.nodes];
  const links = topology.links.length;

  return {
    nodes: nodes.length,
    links,
    maxDepth: Math.min(nodes.length, topology.links.length),
    maxBatch: Math.max(1, Math.min(32, links || 1)),
    sampleRate: nodes.length > 0 ? Math.max(0.05, Math.min(1, 1 / nodes.length)) : 1,
    signature: `${nodes.length}x${links}`,
  };
};

export const buildEdgeRegistry = (edges: readonly MeshTopologyEdge[]) => {
  const index = new Map<MeshTopologyEdge['from'], MeshTopologyEdge[]>();
  for (const edge of edges) {
    const bucket = index.get(edge.from) ?? [];
    bucket.push(edge);
    index.set(edge.from, bucket);
  }
  return index;
};

export const deriveRuntimePaths = (
  topology: MeshTopology,
  pathSeed: readonly MeshNodeContract['id'][],
): MeshRuntimePath[] =>
  pathSeed.map((nodeId) => ({
    token: `${nodeId}-${randomUUID()}`,
    keys: [nodeId] as MeshTopologyPath[],
  }));

export const routeNodeSignals = (topology: MeshTopology, nodes: readonly MeshNodeContract['id'][]) => {
  const registry = buildEdgeRegistry(topology.links);
  const stats = {
    visited: 0,
    skipped: 0,
  } as MeshTopologyServiceState;

  const routed = new Map<MeshNodeContract['id'], number>();

  for (const id of nodes) {
    const outgoing = registry.get(id);
    stats.visited += 1;
    if (!outgoing || outgoing.length === 0) {
      stats.skipped += 1;
    }
    routed.set(id, outgoing?.length ?? 0);
  }

  return {
    ...stats,
    routed,
  };
};

export const getRuntimeStats = (): Readonly<MeshTopologyStats> => ({
  nodes: 12,
  links: 24,
  maxDepth: 4,
  maxBatch: 16,
  sampleRate: 0.25,
  signature: 'boot-12x24',
});
