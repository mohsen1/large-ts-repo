import type { CoordinationStep } from './types';

export interface StepNode<T = CoordinationStep> {
  readonly id: string;
  readonly step: T;
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface TopologySummary {
  readonly totalNodes: number;
  readonly ordered: readonly string[];
  readonly criticalPath: readonly string[];
  readonly layers: readonly readonly string[][];
  readonly maxDepth: number;
}

export interface StepDependencyGraph {
  readonly nodes: ReadonlyMap<string, StepNode>;
  readonly edges: ReadonlySet<string>;
  readonly layers: ReadonlyMap<string, number>;
}

export const buildGraph = (steps: readonly CoordinationStep[]): StepDependencyGraph => {
  const nodes = new Map<string, StepNode>();
  for (const step of steps) {
    nodes.set(step.id, {
      id: step.id,
      step,
      dependencies: [...step.requires],
      dependents: [],
    });
  }

  const edges = new Set<string>();
  for (const node of nodes.values()) {
    for (const dependencyId of node.dependencies) {
      if (!nodes.has(dependencyId)) continue;
      edges.add(`${dependencyId}->${node.id}`);
      const dependency = nodes.get(dependencyId);
      if (!dependency) continue;
      const next = [...dependency.dependents, node.id];
      nodes.set(dependencyId, { ...dependency, dependents: next });
    }
  }

  const layers = computeLayers(nodes);
  return {
    nodes,
    edges,
    layers,
  };
};

export const detectCycles = (graph: StepDependencyGraph): readonly string[][] => {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const edgesFrom = (nodeId: string): readonly string[] => {
    const node = graph.nodes.get(nodeId);
    return node?.dependents ?? [];
  };

  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      const start = stack.lastIndexOf(nodeId);
      const cycle = start >= 0 ? [...stack.slice(start), nodeId] : [nodeId];
      cycles.push(cycle);
      return;
    }
    visiting.add(nodeId);
    stack.push(nodeId);

    for (const target of edgesFrom(nodeId)) {
      walk(target);
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of graph.nodes.keys()) {
    walk(nodeId);
  }
  return cycles;
};

export const topologicalOrder = (steps: readonly CoordinationStep[]): readonly string[] => {
  const graph = buildGraph(steps);
  const indegree = new Map<string, number>();
  for (const [id, node] of graph.nodes) {
    indegree.set(id, node.dependencies.filter((dep) => graph.nodes.has(dep)).length);
  }

  const queue: string[] = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) queue.push(id);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;
    ordered.push(nodeId);
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    for (const dependentId of node.dependents) {
      const next = indegree.get(dependentId);
      if (next === undefined) continue;
      const decreased = next - 1;
      if (decreased === 0) queue.push(dependentId);
      indegree.set(dependentId, decreased);
    }
  }

  return ordered;
};

export const executionLayers = (steps: readonly CoordinationStep[]): readonly readonly string[][] => {
  const graph = buildGraph(steps);
  const ordered = Array.from(graph.layers.entries())
    .sort((a, b) => a[1] - b[1])
    .reduce<Record<number, string[]>>((acc, [stepId, level]) => {
      const layer = acc[level] ?? [];
      return { ...acc, [level]: [...layer, stepId] };
    }, {});

  return Object.keys(ordered)
    .map((key) => Number(key))
    .sort((a, b) => a - b)
    .map((level) => ordered[level] ?? []);
};

export const criticalPath = (steps: readonly CoordinationStep[]): readonly string[] => {
  const graph = buildGraph(steps);
  const ordered = topologicalOrder(steps);
  const longest: Map<string, number> = new Map();
  for (const nodeId of ordered) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    const ownCost = node.step.durationSeconds + (node.step.criticality ?? 0);
    if (node.dependencies.length === 0) {
      longest.set(nodeId, ownCost);
      continue;
    }

    let bestParent = 0;
    for (const dependency of node.dependencies) {
      const candidate = longest.get(dependency) ?? 0;
      if (candidate > bestParent) bestParent = candidate;
    }
    longest.set(nodeId, bestParent + ownCost);
  }

  const maxNode = [...longest.entries()].reduce<{
    id: string;
    cost: number;
  } | undefined>((best, [nodeId, cost]) =>
    !best || cost > best.cost ? { id: nodeId, cost } : best, undefined);
  if (!maxNode) return [];

  const costs = new Map<string, number>(longest);
  const reverseOrder = [...ordered].reverse();
  const path: string[] = [];
  let current = maxNode.id;
  let remainingCost = maxNode.cost;
  while (current) {
    path.push(current);
    const node = graph.nodes.get(current);
    if (!node || node.dependencies.length === 0) break;
    const parents = node.dependencies
      .filter((dependency) => graph.nodes.has(dependency))
      .map((dependency) => ({ dependency, cost: costs.get(dependency) ?? 0 }))
      .sort((a, b) => b.cost - a.cost);
    const next = parents[0];
    if (!next) break;
    if (remainingCost <= next.cost) break;
    current = next.dependency;
    remainingCost -= 1;
  }
  return path.reverse();
};

export const summarizeTopology = (steps: readonly CoordinationStep[]): TopologySummary => {
  const graph = buildGraph(steps);
  const cycles = detectCycles(graph);
  const ordered = topologicalOrder(steps);
  const layers = executionLayers(steps);
  const maxDepth = Math.max(0, ...layers.map((layer) => layer.length));
  return {
    totalNodes: steps.length,
    ordered,
    criticalPath: cycles.length > 0 ? [] : criticalPath(steps),
    layers,
    maxDepth,
  };
};

const computeLayers = (nodes: ReadonlyMap<string, StepNode>): ReadonlyMap<string, number> => {
  const levels = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    if (levels.has(id)) return levels.get(id) ?? 0;
    if (stack.has(id)) return 0;
    const node = nodes.get(id);
    if (!node) return 0;
    stack.add(id);

    let maxParent = -1;
    for (const dependencyId of node.dependencies) {
      const depth = visit(dependencyId, stack);
      if (depth > maxParent) maxParent = depth;
    }

    stack.delete(id);
    const level = maxParent + 1;
    levels.set(id, level);
    return level;
  };

  for (const id of nodes.keys()) {
    visit(id, new Set());
  }
  return levels;
};
