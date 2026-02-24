import type { LabGraph, LabNodeLink, LabTemplateStep, StepId } from './types';

export const buildLabTopology = (steps: readonly LabTemplateStep[]): LabGraph => {
  const nodes = steps.map((step) => step.id);
  const links: LabNodeLink<StepId>[] = steps.flatMap((step) =>
    step.dependencies.map((dependency) => ({
      from: dependency,
      to: step.id,
      criticality: Math.min(1, Math.max(0.01, 0.4 + dependency.length * 0.01)),
      weight: 1,
    })),
  );

  return { nodes, links };
};

export const findRoots = (graph: LabGraph): readonly StepId[] => {
  const referenced = new Set(graph.links.map((link) => link.to));
  return graph.nodes.filter((node) => !referenced.has(node));
};

export const hasCycle = (graph: LabGraph): boolean => {
  const adjacency = new Map<StepId, readonly StepId[]>();
  for (const node of graph.nodes) {
    adjacency.set(node, []);
  }
  for (const link of graph.links) {
    adjacency.set(link.from, [...(adjacency.get(link.from) ?? []), link.to]);
  }

  const visiting = new Set<StepId>();
  const visited = new Set<StepId>();

  const step = (node: StepId): boolean => {
    if (visited.has(node)) {
      return false;
    }
    if (visiting.has(node)) {
      return true;
    }
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (step(next)) {
        return true;
      }
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  return graph.nodes.some((node) => step(node));
};

export const orderByDependencies = (graph: LabGraph): readonly StepId[] => {
  if (hasCycle(graph)) {
    return graph.nodes;
  }

  const incoming = new Map<StepId, number>();
  const outgoing = new Map<StepId, StepId[]>();

  for (const node of graph.nodes) {
    incoming.set(node, 0);
    outgoing.set(node, []);
  }

  for (const link of graph.links) {
    incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1);
    outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link.to]);
  }

  const queue: StepId[] = graph.nodes.filter((node) => (incoming.get(node) ?? 0) === 0);
  const ordered: StepId[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    ordered.push(current);

    for (const next of outgoing.get(current) ?? []) {
      const count = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, count);
      if (count === 0) {
        queue.push(next);
      }
    }
  }

  return [...ordered, ...graph.nodes.filter((node) => !ordered.includes(node))];
};

export const criticalPath = (graph: LabGraph): readonly StepId[] => {
  const ordered = orderByDependencies(graph);
  return [...ordered].reverse();
};

export const calculateNodePressure = (graph: LabGraph, baseline = 1): Record<string, number> => {
  const pressure: Record<string, number> = {};
  for (const node of graph.nodes) {
    pressure[node] = baseline;
  }

  for (const link of graph.links) {
    pressure[link.from] = Math.max(pressure[link.from] ?? baseline, pressure[link.to] ?? baseline) + link.criticality;
  }

  return pressure;
};

export const graphToText = (graph: LabGraph): string =>
  graph.nodes.map((node) => {
    const out = graph.links.filter((link) => link.from === node).map((link) => link.to).join(',');
    return `${node} -> [${out}]`;
  }).join('\n');
