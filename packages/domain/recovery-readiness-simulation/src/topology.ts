import { normalizeGraph } from './graph';
import { type SimulationConstraint, type SimulationGraph } from './types';

export interface TopologyDigest {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly roots: readonly string[];
  readonly leaves: readonly string[];
}

export const readTopology = (graph: SimulationGraph, constraints: SimulationConstraint): TopologyDigest => {
  const normalized = normalizeGraph(graph, constraints);
  return {
    nodeCount: normalized.nodes.length,
    edgeCount: normalized.dependencies.length,
    roots: normalized.rootNodes,
    leaves: normalized.leafNodes,
  };
};

export const summarizeTopology = (digest: TopologyDigest): string =>
  `nodes=${digest.nodeCount}, edges=${digest.edgeCount}, roots=${digest.roots.length}, leaves=${digest.leaves.length}`;

export const topologicalWaveOrder = (graph: SimulationGraph, constraints: SimulationConstraint): readonly string[] => {
  const normalized = normalizeGraph(graph, constraints);
  const visited = new Set<string>();
  const order: string[] = [];

  const walk = (node: string) => {
    if (visited.has(node)) return;
    visited.add(node);
    order.push(node);
  };

  for (const root of normalized.rootNodes) {
    walk(root);
  }

  for (const leaf of normalized.leafNodes) {
    if (!visited.has(leaf)) {
      walk(leaf);
    }
  }

  return order;
};
