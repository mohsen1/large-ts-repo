import type { StrategyDependency, StrategyStepNode } from './types';

export interface TopologyResult {
  readonly order: readonly string[];
  readonly parallelStages: readonly string[];
  readonly blocked: readonly string[];
}

export interface GraphSnapshot {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly isolatedNodes: readonly string[];
  readonly cycleDetected: boolean;
}

interface GraphState {
  readonly incoming: Map<string, Set<string>>;
  readonly outgoing: Map<string, Set<string>>;
  readonly nodes: Set<string>;
}

const initState = (steps: readonly StrategyStepNode[], dependencies: readonly StrategyDependency[]): GraphState => {
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  const nodes = new Set(steps.map((step) => step.stepId));

  for (const step of steps) {
    incoming.set(step.stepId, new Set());
    outgoing.set(step.stepId, new Set());
  }

  for (const dependency of dependencies) {
    const source = dependency.from;
    for (const target of dependency.to) {
      if (!nodes.has(source) || !nodes.has(target)) {
        continue;
      }
      incoming.get(target)?.add(source);
      outgoing.get(source)?.add(target);
    }
  }

  return { incoming, outgoing, nodes };
};

const extractRoots = (nodes: Set<string>, incoming: Map<string, Set<string>>) =>
  [...nodes].filter((node) => (incoming.get(node)?.size ?? 0) === 0);

export const buildTopology = (steps: readonly StrategyStepNode[], dependencies: readonly StrategyDependency[]): TopologyResult => {
  const { incoming, outgoing, nodes } = initState(steps, dependencies);
  const queue = extractRoots(nodes, incoming);
  const visited = new Set<string>();
  const stages: string[][] = [];

  while (queue.length > 0) {
    const stage = [...queue];
    queue.length = 0;
    const next: string[] = [];

    for (const node of stage) {
      visited.add(node);
      nodes.delete(node);
      const children = outgoing.get(node);
      if (!children) {
        continue;
      }
      for (const child of children) {
        const incomingChildren = incoming.get(child);
        if (!incomingChildren) {
          continue;
        }
        incomingChildren.delete(node);
        if (incomingChildren.size === 0) {
          next.push(child);
        }
      }
    }

    stages.push(stage);
    queue.push(...next);
  }

  return {
    order: [...visited],
    parallelStages: stages.flat(),
    blocked: [...nodes],
  };
};

export const hasCycle = (steps: readonly StrategyStepNode[], dependencies: readonly StrategyDependency[]): boolean => {
  const result = buildTopology(steps, dependencies);
  return result.blocked.length > 0;
};

export const summarizeTopology = (steps: readonly StrategyStepNode[], dependencies: readonly StrategyDependency[]): GraphSnapshot => {
  const topology = buildTopology(steps, dependencies);
  const edgeCount = dependencies.reduce((sum, dependency) => sum + dependency.to.length, 0);
  const isolatedNodes = topology.order.filter((stepId) => !topology.blocked.includes(stepId));

  return {
    nodeCount: steps.length,
    edgeCount,
    isolatedNodes,
    cycleDetected: topology.blocked.length > 0,
  };
};

export const flattenDependencies = (dependencies: readonly StrategyDependency[]) => {
  const flattened: Array<{ from: string; to: string; soft: boolean }> = [];
  for (const dependency of dependencies) {
    if (dependency.to.length === 0) {
      flattened.push({ from: dependency.from, to: dependency.from, soft: dependency.soft });
      continue;
    }

    for (const target of dependency.to) {
      flattened.push({ from: dependency.from, to: target, soft: dependency.soft });
    }
  }

  return flattened;
};

export const buildReverseLookup = (dependencies: readonly StrategyDependency[]): Map<string, readonly string[]> => {
  const lookup = new Map<string, string[]>();
  for (const entry of flattenDependencies(dependencies)) {
    const prior = lookup.get(entry.to) ?? [];
    lookup.set(entry.to, [...prior, entry.from]);
  }
  return lookup;
};
