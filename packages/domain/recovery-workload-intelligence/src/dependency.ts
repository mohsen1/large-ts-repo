import type { WorkloadDependencyEdge, WorkloadDependencyGraph, WorkloadUnitId } from './types';

export interface DependencyLevel {
  readonly nodeId: WorkloadUnitId;
  readonly level: number;
  readonly parentCount: number;
  readonly childCount: number;
}

export const buildLevels = (graph: WorkloadDependencyGraph): readonly DependencyLevel[] => {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, number>();

  for (const node of graph.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, new Set());
  }

  for (const edge of graph.edges) {
    const targetChildren = outgoing.get(edge.parent) ?? new Set();
    targetChildren.add(edge.child);
    outgoing.set(edge.parent, targetChildren);
    incoming.set(edge.child, (incoming.get(edge.child) ?? 0) + 1);
  }

  const nodesByIncoming = [...incoming.entries()].sort((a, b) => a[1] - b[1]);
  return nodesByIncoming.map(([nodeId, parentCount]) => {
    const children = outgoing.get(nodeId) ?? new Set();
    return {
      nodeId: nodeId as WorkloadUnitId,
      level: Math.max(0, parentCount - 1),
      parentCount,
      childCount: children.size,
    };
  });
};

export const hasCycles = (graph: WorkloadDependencyGraph): boolean => {
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

  const queue: string[] = [...indegree.entries()].filter(([, count]) => count === 0).map(([nodeId]) => nodeId);
  let processed = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    processed += 1;
    for (const next of adjacency.get(current) ?? []) {
      const nextCount = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
      }
    }
  }

  return processed !== indegree.size;
};

export const findRoots = (graph: WorkloadDependencyGraph): readonly WorkloadUnitId[] => {
  const children = new Set<string>(graph.edges.map((edge) => edge.child));
  return graph.nodes
    .map((node) => node.id)
    .filter((nodeId) => !children.has(nodeId));
};

export const criticalPath = (graph: WorkloadDependencyGraph, start: WorkloadUnitId): readonly WorkloadUnitId[] => {
  const adjacency = new Map<string, WorkloadUnitId[]>();
  for (const edge of graph.edges) {
    const next = adjacency.get(edge.parent) ?? [];
    next.push(edge.child);
    adjacency.set(edge.parent, next);
  }

  const path: WorkloadUnitId[] = [start];
  const visited = new Set<string>([start]);

  const walk = (current: string): WorkloadUnitId[] => {
    const next = adjacency.get(current) ?? [];
    if (next.length === 0) {
      return [current as WorkloadUnitId];
    }

    const candidate = [...next].sort((left, right) => left.localeCompare(right))[0];
    if (visited.has(candidate)) {
      return [current as WorkloadUnitId];
    }
    visited.add(candidate);
    return [current as WorkloadUnitId, ...walk(candidate)];
  };

  const fullPath = walk(start);
  const [, ...tail] = fullPath;
  return [start, ...tail];
};
