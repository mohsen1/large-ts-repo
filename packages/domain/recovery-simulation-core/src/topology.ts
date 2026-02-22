import type { SimulationScenarioBlueprint, SimulationStepId, SimulationTimeline } from './types';

export interface TopologyLayer {
  readonly id: number;
  readonly steps: readonly SimulationStepId[];
}

export interface TopologyPlan {
  readonly orderedSteps: SimulationTimeline;
  readonly layers: readonly TopologyLayer[];
  readonly hasCycles: boolean;
  readonly isolatedStepCount: number;
}

export const buildLayers = (scenario: SimulationScenarioBlueprint): readonly TopologyLayer[] => {
  const layers: TopologyLayer[] = [];
  const resolved = new Set<SimulationStepId>();
  const unresolved = new Set(scenario.steps.map((step) => step.id));

  while (unresolved.size > 0) {
    const current: SimulationStepId[] = [];
    for (const step of scenario.steps) {
      if (!unresolved.has(step.id)) {
        continue;
      }
      const ready = step.dependsOn.every((dependency) => !unresolved.has(dependency));
      if (ready) {
        current.push(step.id);
      }
    }

    if (current.length === 0) {
      return [
        ...layers,
        {
          id: layers.length,
          steps: [...unresolved.values()],
        },
      ];
    }

    layers.push({ id: layers.length, steps: current });
    for (const stepId of current) {
      unresolved.delete(stepId);
      resolved.add(stepId);
    }
  }

  return layers;
};

export const calculateTopology = (scenario: SimulationScenarioBlueprint): TopologyPlan => {
  const layers = buildLayers(scenario);
  const orderedSteps = layers.flatMap((layer) => layer.steps);
  const hasCycles = orderedSteps.length !== scenario.steps.length;
  const isolatedStepCount = scenario.steps.filter((step) => step.dependsOn.length === 0).length;
  return {
    orderedSteps,
    layers,
    hasCycles,
    isolatedStepCount,
  };
};

export const criticalPathMs = (scenario: SimulationScenarioBlueprint, topology: TopologyPlan): number => {
  if (topology.hasCycles) {
    return scenario.steps.reduce((sum, step) => sum + step.expectedDurationMs, 0);
  }

  const lookup = new Map(scenario.steps.map((step) => [step.id, step.expectedDurationMs] as const));
  return topology.layers.reduce((sum, layer) => {
    let maxLayer = 0;
    for (const id of layer.steps) {
      maxLayer = Math.max(maxLayer, lookup.get(id) ?? 0);
    }
    return sum + maxLayer;
  }, 0);
};
