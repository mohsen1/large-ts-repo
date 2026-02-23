import type { SimulationEdgeWeight, SimulationLabBlueprint, SimulationPlanDraft, SimulationSimulationWindow } from './types';

export interface TopologyNode {
  readonly id: string;
  readonly inboundCount: number;
  readonly outboundCount: number;
  readonly depth: number;
}

export interface TopologyLayer {
  readonly index: number;
  readonly nodes: readonly string[];
  readonly durationMs: number;
}

export interface TopologyBlueprint {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly SimulationEdgeWeight[];
  readonly orderedByDependencies: readonly string[];
  readonly layers: readonly TopologyLayer[];
  readonly isolatedNodeIds: readonly string[];
}

export const buildTopology = (blueprint: SimulationLabBlueprint): TopologyBlueprint => {
  const inboundCount = new Map<string, number>();
  const outboundMap = new Map<string, number>();

  for (const node of blueprint.nodes) {
    inboundCount.set(node.id, 0);
    outboundMap.set(node.id, 0);
  }

  for (const dependency of blueprint.dependencies) {
    const source = dependency.dependencyId;
    for (const required of dependency.requiredDependencyIds) {
      outboundMap.set(source, (outboundMap.get(source) ?? 0) + 1);
      inboundCount.set(required, (inboundCount.get(required) ?? 0) + 1);
    }
  }

  const orderedByDependencies = [...blueprint.nodes]
    .sort((left, right) => (inboundCount.get(left.id) ?? 0) - (inboundCount.get(right.id) ?? 0))
    .map((node) => node.id);

  const layers: TopologyLayer[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < orderedByDependencies.length) {
    const batch = orderedByDependencies.slice(cursor, cursor + 2);
    layers.push({
      index,
      nodes: batch,
      durationMs: batch.reduce((sum, nodeId) => {
        const incoming = inboundCount.get(nodeId) ?? 0;
        return sum + 90_000 + incoming * 5_000;
      }, 0),
    });
    index += 1;
    cursor += 2;
  }

  const isolatedNodeIds = [...blueprint.nodes.values()].filter((node) =>
    (inboundCount.get(node.id) ?? 0) === 0 && (outboundMap.get(node.id) ?? 0) === 0,
  ).map((node) => node.id);

  return {
    nodes: blueprint.nodes.map((node) => ({
      id: node.id,
      inboundCount: inboundCount.get(node.id) ?? 0,
      outboundCount: outboundMap.get(node.id) ?? 0,
      depth: ((inboundCount.get(node.id) ?? 0) > 0 ? 1 : 0) + (node.criticality > 3 ? 1 : 0),
    })),
    edges: blueprint.edges,
    orderedByDependencies,
    layers,
    isolatedNodeIds,
  };
};

export const buildWindowProjection = (draft: SimulationPlanDraft): SimulationSimulationWindow => ({
  start: draft.window.start,
  end: draft.window.end,
  bufferMinutes: draft.window.bufferMinutes,
  timezone: draft.window.timezone,
});
