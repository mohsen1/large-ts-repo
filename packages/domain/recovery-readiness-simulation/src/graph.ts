import { type SimulationConstraint, type SimulationDependency, type SimulationGraph, type SimulationNode } from './types';

export interface NormalizedGraph {
  readonly nodes: readonly SimulationNode[];
  readonly dependencies: readonly SimulationDependency[];
  readonly rootNodes: readonly string[];
  readonly leafNodes: readonly string[];
}

const key = (value: string): string => value.trim().toLowerCase();

const hasCycle = (nodes: readonly string[], adjacency: Map<string, readonly string[]>): boolean => {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const walk = (node: string): boolean => {
    if (visited.has(node)) return false;
    if (visiting.has(node)) return true;
    visiting.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (walk(next)) {
        return true;
      }
    }

    visiting.delete(node);
    visited.add(node);
    return false;
  };

  return nodes.some((node) => walk(node));
};

export const normalizeGraph = (graph: SimulationGraph, constraints: SimulationConstraint): NormalizedGraph => {
  const nodeIds = graph.nodes.map((node) => node.id);
  const known = new Set(nodeIds.map((nodeId) => key(nodeId)));
  const dependencies = graph.dependencies
    .filter((dependency) => known.has(key(dependency.from)) && known.has(key(dependency.to)))
    .map((dependency) => ({
      from: key(dependency.from),
      to: key(dependency.to),
      reason: dependency.reason,
    }));

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const nodeId of known) {
    adjacency.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }

  for (const dependency of dependencies) {
    const upstream = key(dependency.from);
    const downstream = key(dependency.to);
    if (constraints.minWindowCoverage <= 0) {
      continue;
    }
    adjacency.get(upstream)?.push(downstream);
    inDegree.set(downstream, (inDegree.get(downstream) ?? 0) + 1);
  }

  if (hasCycle(Array.from(known), adjacency)) {
    throw new Error('simulation-cycle-detected');
  }

  const roots: string[] = [];
  const leaves: string[] = [];
  for (const [nodeId, degree] of inDegree.entries()) {
    if ((degree ?? 0) === 0) roots.push(nodeId);
    if ((adjacency.get(nodeId)?.length ?? 0) === 0) leaves.push(nodeId);
  }

  return {
    nodes: graph.nodes,
    dependencies,
    rootNodes: roots,
    leafNodes: leaves,
  };
};

export const sortByCriticality = (nodes: readonly SimulationNode[]): readonly SimulationNode[] =>
  [...nodes].sort((first, second) => second.criticality - first.criticality);

export const partitionByOwner = (nodes: readonly SimulationNode[]): Record<SimulationNode['owner'], string[]> => {
  const output: Record<SimulationNode['owner'], string[]> = {
    sre: [],
    platform: [],
    core: [],
    security: [],
  };

  for (const node of nodes) {
    output[node.owner].push(node.id);
  }

  return output;
};
