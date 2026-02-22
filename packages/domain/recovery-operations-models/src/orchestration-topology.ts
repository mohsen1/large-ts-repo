import type { RecoveryProgram, RecoveryStep } from '@domain/recovery-orchestration';

export type TopologyNodeId = RecoveryStep['id'];

export type TopologySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TopologyEdge {
  readonly from: TopologyNodeId;
  readonly to: TopologyNodeId;
}

export interface TopologyLayer {
  readonly index: number;
  readonly stepIds: readonly TopologyNodeId[];
  readonly timeoutMs: number;
  readonly approvalLoad: number;
  readonly tags: readonly string[];
}

export interface TopologySummary {
  readonly stepCount: number;
  readonly layerCount: number;
  readonly averageTimeoutMs: number;
  readonly criticalPathLength: number;
  readonly riskSurface: TopologySeverity;
}

export interface ProgramTopology {
  readonly programId: RecoveryProgram['id'];
  readonly layers: readonly TopologyLayer[];
  readonly edges: readonly TopologyEdge[];
  readonly isolatedSteps: readonly TopologyNodeId[];
  readonly summary: TopologySummary;
}

type NodeWithDependencyCount = [TopologyNodeId, number];

const asFiniteNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

const collectEdges = (steps: readonly RecoveryStep[]): readonly TopologyEdge[] => {
  const edges: TopologyEdge[] = [];
  for (const step of steps) {
    for (const dependency of step.dependencies) {
      edges.push({ from: dependency, to: step.id });
    }
  }
  return edges;
};

const buildDependencyMap = (steps: readonly RecoveryStep[]): Map<TopologyNodeId, Set<TopologyNodeId>> => {
  const map = new Map<TopologyNodeId, Set<TopologyNodeId>>();
  for (const step of steps) {
    map.set(step.id, new Set(step.dependencies));
  }
  return map;
};

const dependencyCount = (dependencies: ReadonlyMap<TopologyNodeId, Set<TopologyNodeId>>): NodeWithDependencyCount[] => {
  return Array.from(dependencies.entries()).map(([stepId, edges]) => [stepId, edges.size]);
};

const extractLayer = (
  dependencies: Map<TopologyNodeId, Set<TopologyNodeId>>,
): readonly TopologyNodeId[] => {
  const ready: TopologyNodeId[] = [];
  for (const [stepId, requires] of dependencies.entries()) {
    if (requires.size === 0) {
      ready.push(stepId);
    }
  }

  if (ready.length > 0) {
    return ready;
  }

  const [fallback] = dependencyCount(dependencies)
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));

  return fallback ? [fallback[0]] : [];
};

const resolve = (
  steps: readonly RecoveryStep[],
  dependencies: Map<TopologyNodeId, Set<TopologyNodeId>>,
  layerIndex: number,
): TopologyLayer => {
  const layerStepIds = extractLayer(dependencies);
  const byId = new Map<TopologyNodeId, RecoveryStep>(steps.map((step) => [step.id, step]));
  const tags = new Set<string>();

  const totalTimeout = layerStepIds.reduce((acc, stepId) => {
    const step = byId.get(stepId);
    if (!step) {
      return acc;
    }
    for (const tag of step.tags) {
      tags.add(tag);
    }
    return acc + asFiniteNumber(step.timeoutMs);
  }, 0);

  const approvalLoad = layerStepIds.reduce((acc, stepId) => {
    const step = byId.get(stepId);
    if (!step) {
      return acc;
    }
    return acc + (asFiniteNumber(step.requiredApprovals) + 1);
  }, 0);

  return {
    index: layerIndex,
    stepIds: layerStepIds,
    timeoutMs: Math.max(0, Math.floor(totalTimeout)),
    approvalLoad,
    tags: [...tags],
  };
};

const consumeLayer = (
  dependencies: Map<TopologyNodeId, Set<TopologyNodeId>>,
  layerStepIds: readonly TopologyNodeId[],
): void => {
  for (const stepId of layerStepIds) {
    dependencies.delete(stepId);
    for (const requires of dependencies.values()) {
      requires.delete(stepId);
    }
  }
};

const estimateRiskSurface = (program: RecoveryProgram): TopologySeverity => {
  const maxApprovals = Math.max(...program.steps.map((step) => asFiniteNumber(step.requiredApprovals)), 0);
  const maxTimeout = Math.max(...program.steps.map((step) => asFiniteNumber(step.timeoutMs)), 0);
  const dependencyFanout = program.steps.reduce((acc, step) => acc + step.dependencies.length, 0);
  const riskScore = maxApprovals * 0.35 + (maxTimeout / 1000) * 0.25 + dependencyFanout * 0.4;

  if (riskScore >= 30) return 'critical';
  if (riskScore >= 18) return 'high';
  if (riskScore >= 8) return 'medium';
  return 'low';
};

export const buildProgramTopology = (program: RecoveryProgram): ProgramTopology => {
  const edges = collectEdges(program.steps);
  const dependencies = buildDependencyMap(program.steps);
  const stepIds = new Set<TopologyNodeId>(program.steps.map((step) => step.id));
  const layers: TopologyLayer[] = [];
  let safety = 0;

  while (dependencies.size > 0 && safety < 2_000) {
    const layer = resolve(program.steps, dependencies, layers.length);
    const layerStepIds = layer.stepIds.filter((stepId) => stepIds.has(stepId));
    if (layerStepIds.length === 0) {
      break;
    }
    consumeLayer(dependencies, layerStepIds);
    layers.push({
      ...layer,
      stepIds: layerStepIds,
    });
    safety += 1;
  }

  const remainingStepIds = [...stepIds].filter((stepId) => dependencies.has(stepId));
  const orderedTimeout = layers.reduce((sum, layer) => sum + layer.timeoutMs, 0);
  const avgTimeout = program.steps.length === 0 ? 0 : orderedTimeout / program.steps.length;
  const criticalPathLength = layers.reduce((maxDepth, layer) => Math.max(maxDepth, layer.index + 1), 0);

  return {
    programId: program.id,
    layers,
    edges,
    isolatedSteps: remainingStepIds.filter((stepId) => dependencies.get(stepId)?.size === 0),
    summary: {
      stepCount: program.steps.length,
      layerCount: layers.length,
      averageTimeoutMs: Number(avgTimeout.toFixed(2)),
      criticalPathLength,
      riskSurface: estimateRiskSurface(program),
    },
  };
};

export const summarizeTopology = (program: RecoveryProgram): TopologySummary =>
  buildProgramTopology(program).summary;

export const flattenTopologyLayers = (topology: ProgramTopology): readonly TopologyNodeId[] =>
  topology.layers.flatMap((layer) => layer.stepIds);

export const topologyHasCycle = (program: RecoveryProgram): boolean =>
  buildProgramTopology(program).isolatedSteps.length > 0 && buildProgramTopology(program).layers.length > 0;
