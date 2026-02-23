import type { ForgeDependency, ForgeEdge, ForgeGraph, ForgeNode, ForgeNodePriority, ForgeTopology, ForgeNodeState } from './types';
import { withBrand } from '@shared/core';

export interface GraphMetrics {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly averageFanIn: number;
  readonly averageFanOut: number;
  readonly hasCycles: boolean;
  readonly maxDepth: number;
}

const byParent = (graph: ForgeGraph): Record<string, ForgeEdge[]> =>
  graph.edges.reduce<Record<string, ForgeEdge[]>>((acc, edge) => {
    (acc[edge.from] ??= []).push(edge);
    return acc;
  }, {});

export const collectRootNodes = (graph: ForgeGraph): readonly string[] => {
  const inbound = graph.edges.reduce<Record<string, number>>((acc, edge) => {
    acc[edge.to] = (acc[edge.to] ?? 0) + 1;
    return acc;
  }, {});

  return graph.nodes
    .filter((node) => (inbound[node.id] ?? 0) === 0)
    .map((node) => node.id);
};

export const normalizeNodeOrder = (graph: ForgeGraph): readonly ForgeNode[] => {
  const inDegree = graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.id] = 0;
    return acc;
  }, {});

  for (const edge of graph.edges) {
    inDegree[edge.to] = (inDegree[edge.to] ?? 0) + 1;
  }

  const ordered: ForgeNode[] = [];
  const queue = [...collectRootNodes(graph)];
  const remaining = new Set(graph.nodes.map((node) => node.id));
  const byId = Object.fromEntries(graph.nodes.map((node) => [node.id, node] as const));

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || !remaining.delete(next)) {
      continue;
    }
    const node = byId[next];
    if (!node) {
      continue;
    }
    ordered.push(node);

    for (const edge of byParent(graph)[next] ?? []) {
      const incoming = graph.edges.filter((candidate) => candidate.to === edge.to).length;
      if (incoming <= 1) {
        queue.push(edge.to);
      }
    }
  }

  const unresolved = graph.nodes
    .map((node) => node.id)
    .filter((nodeId) => remaining.has(nodeId));

  return [...ordered, ...unresolved.map((nodeId) => byId[nodeId]).filter((node): node is ForgeNode => Boolean(node))];
};

export const buildPriorities = (graph: ForgeGraph): ForgeNodePriority => {
  const nodes = normalizeNodeOrder(graph);
  const byDependencies = nodes.reduce<Record<string, ForgeDependency[]>>((acc, node) => {
    acc[node.id] = [...node.dependencies];
    return acc;
  }, {});

  return Object.fromEntries(
    nodes.map((node, index) => {
      const parentScore = byDependencies[node.id]?.reduce<number>((acc, dep) => acc + dep.criticality, 0) ?? 0;
      const couplingScore = byDependencies[node.id]?.reduce<number>((acc, dep) => acc + dep.coupling, 0) ?? 0;
      const raw = Math.max(1, Math.min(100, 120 - index * 2 + parentScore - couplingScore * 2));
      return [node.id, Math.round(raw)];
    }),
  ) as ForgeNodePriority;
};

const buildNodeDepth = (graph: ForgeGraph, nodeId: string, memo: Map<string, number>): number => {
  if (memo.has(nodeId)) {
    return memo.get(nodeId) ?? 0;
  }

  const incoming = graph.edges.filter((edge) => edge.to === nodeId);
  if (incoming.length === 0) {
    memo.set(nodeId, 0);
    return 0;
  }

  const bestParent = Math.max(...incoming.map((edge) => buildNodeDepth(graph, edge.from, memo) + 1));
  memo.set(nodeId, bestParent);
  return bestParent;
};

export const splitByDepth = (graph: ForgeGraph): readonly ForgeTopology[] => {
  const memo = new Map<string, number>();
  const byDepth: Record<number, ForgeNodeState[]> = {};

  for (const node of graph.nodes) {
    const depth = buildNodeDepth(graph, node.id, memo);
    byDepth[depth] ??= [];
    byDepth[depth]!.push({
      node,
      progress: 0,
      startedAt: new Date().toISOString(),
    });
  }

  return Object.entries(byDepth)
    .map(([key, nodes], index) => ({
      planId: withBrand(`${graph.planId}-wave-${key}`, 'RecoveryForgePlanId'),
      wave: index,
      nodes,
    }))
    .sort((left, right) => left.wave - right.wave);
};

export const evaluateGraphHealth = (graph: ForgeGraph): GraphMetrics => {
  const out = graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.id] = 0;
    return acc;
  }, {});

  const inDeg: Record<string, number> = {};
  for (const edge of graph.edges) {
    out[edge.from] += 1;
    inDeg[edge.to] = (inDeg[edge.to] ?? 0) + 1;
  }

  let cycleCount = 0;
  const stack = new Set<string>();
  const complete = new Set<string>();

  const detect = (nodeId: string): void => {
    if (stack.has(nodeId)) {
      cycleCount += 1;
      return;
    }
    if (complete.has(nodeId)) {
      return;
    }

    stack.add(nodeId);
    for (const edge of graph.edges.filter((item) => item.from === nodeId)) {
      detect(edge.to);
    }
    stack.delete(nodeId);
    complete.add(nodeId);
  };

  for (const node of graph.nodes) {
    detect(node.id);
  }

  const fanIn = Object.values(inDeg);
  const fanOut = Object.values(out);
  const avg = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((acc, next) => acc + next, 0) / values.length);
  const maxDepth = Math.max(0, ...graph.nodes.map((node) => buildNodeDepth(graph, node.id, new Map<string, number>())));

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    averageFanIn: Number(avg(fanIn).toFixed(2)),
    averageFanOut: Number(avg(fanOut).toFixed(2)),
    hasCycles: cycleCount > 0,
    maxDepth,
  };
};
