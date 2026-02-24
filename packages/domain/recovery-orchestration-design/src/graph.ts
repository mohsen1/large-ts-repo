import type { StageEdge, StageNode, RecoveryRunbook } from './models';
import { chain } from '@shared/orchestration-kernel';

export type NodeTopology = Record<string, readonly string[]>;
export type EdgeWeight = Readonly<{ readonly from: string; readonly to: string; readonly weight: number }>;

export type OutgoingMap<TEdges extends readonly EdgeWeight[]> = {
  [T in TEdges[number] as T['from']]: readonly T['to'][];
};

export type PathDepth<T extends readonly string[], N extends number = 0> = T['length'] extends N
  ? [...T]
  : never;

export interface TopologySummary {
  readonly roots: readonly string[];
  readonly terminals: readonly string[];
  readonly cycleFree: boolean;
  readonly maxDepth: number;
  readonly edgeCount: number;
}

export interface TopologySnapshot {
  readonly nodes: readonly string[];
  readonly edges: readonly EdgeWeight[];
  readonly levels: Readonly<Record<number, readonly string[]>>;
}

const normalizeEdge = (edge: StageEdge): EdgeWeight => ({
  from: edge.from,
  to: edge.to,
  weight: Math.max(0, edge.latencyMs),
});

export const buildAdjacency = (edges: readonly StageEdge[]): NodeTopology => {
  const lookup = new Map<string, Set<string>>();
  for (const edge of edges.map(normalizeEdge)) {
    const bucket = lookup.get(edge.from) ?? new Set();
    bucket.add(edge.to);
    lookup.set(edge.from, bucket);
  }
  const adjacency: NodeTopology = {};
  for (const [nodeId, targets] of lookup) {
    adjacency[nodeId] = [...targets];
  }
  return adjacency;
};

export const buildIncoming = (edges: readonly StageEdge[]): Readonly<Record<string, readonly string[]>> => {
  const incoming: Record<string, string[]> = {};
  for (const edge of edges.map(normalizeEdge)) {
    const bucket = incoming[edge.to] ?? [];
    bucket.push(edge.from);
    incoming[edge.to] = bucket;
  }
  return incoming as Readonly<Record<string, readonly string[]>>;
};

export const nodeOrder = (nodes: readonly StageNode[], edges: readonly StageEdge[]): readonly string[] => {
  const adjacency = buildAdjacency(edges);
  const incoming = buildIncoming(edges);
  const queue = [...nodes.map((node) => node.id)].filter((id) => (incoming[id] ?? []).length === 0);
  const visited = new Set<string>(queue);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const target of adjacency[current] ?? []) {
      if (visited.has(target)) {
        continue;
      }
      const incomingCount = (incoming[target] ?? []).filter((value) => !visited.has(value)).length;
      if (incomingCount === 0) {
        visited.add(target);
        queue.push(target);
      }
    }
  }
  return order;
};

export const summarizeTopology = (runbook: RecoveryRunbook): TopologySummary => {
  const adjacency = buildAdjacency(runbook.edges);
  const incoming = buildIncoming(runbook.edges);
  const indegree = new Map<string, number>(runbook.nodes.map((node) => [node.id, (incoming[node.id] ?? []).length]));
  const roots = [...indegree.entries()].filter(([, inDegree]) => inDegree === 0).map(([id]) => id);
  const terminals = runbook.nodes.filter((node) => (adjacency[node.id] ?? []).length === 0).map((node) => node.id);
  const order = nodeOrder(runbook.nodes, runbook.edges);
  const cycleFree = order.length === runbook.nodes.length;
  const byDepth = nodeOrderDepth(runbook.nodes.map((node) => node.id), runbook.edges);
  return {
    roots,
    terminals,
    cycleFree,
    maxDepth: Math.max(0, ...Object.keys(byDepth).map((depth) => Number(depth))),
    edgeCount: runbook.edges.length,
  };
};

export const nodeOrderDepth = (
  nodeIds: readonly string[],
  edges: readonly StageEdge[],
): Readonly<Record<number, readonly string[]>> => {
  const adjacency = buildAdjacency(edges);
  const roots = new Set<string>(nodeIds);
  const incoming = buildIncoming(edges);
  for (const incomingIds of Object.keys(incoming)) {
    roots.delete(incomingIds);
  }

  const byDepth = new Map<number, string[]>();
  let frontier = [...roots];
  let depth = 0;

  while (frontier.length > 0) {
    byDepth.set(depth, frontier);
    const nextFrontier: string[] = [];
    const visited = new Set<string>();
    for (const node of frontier) {
      for (const next of adjacency[node] ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          nextFrontier.push(next);
        }
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }

  return Object.fromEntries([...byDepth.entries()].map(([key, value]) => [key, [...value]]));
};

export const snapshotTopology = (runbook: RecoveryRunbook): TopologySnapshot => ({
  nodes: runbook.nodes.map((node) => node.id),
  edges: runbook.edges.map(normalizeEdge),
  levels: nodeOrderDepth(runbook.nodes.map((node) => node.id), runbook.edges),
});

export const criticalPath = (runbook: RecoveryRunbook): readonly string[] =>
  Object.entries(buildAdjacency(runbook.edges))
    .map(([nodeId, outgoing]) => [nodeId, outgoing.length] as const)
    .sort((left, right) => right[1] - left[1])
    .map(([nodeId]) => nodeId)
    .slice(0, 10);
