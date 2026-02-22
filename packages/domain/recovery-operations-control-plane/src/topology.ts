import type { Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type { ControlPlaneCommand, ControlPlaneEdge, ControlPlaneGraph, PlanSchedule } from './types';
import type { RecoveryProgram, RecoveryStep } from '@domain/recovery-orchestration';

type StepId = RecoveryStep['id'];
type CommandQueue = ControlPlaneCommand[];

export interface TopologyBuildOptions {
  readonly maxDepth: number;
  readonly maxWeight: number;
  readonly disallowCycles: boolean;
}

export interface TopologyDiagnostics {
  readonly unreachableCount: number;
  readonly cycleDetected: boolean;
  readonly parallelism: number;
  readonly spanMs: number;
}

interface StepMetadata {
  readonly stepId: StepId;
  readonly commandType: string;
  readonly dependencies: Set<StepId>;
}

const collectCommands = (program: RecoveryProgram): CommandQueue =>
  program.steps.map((step, index) => ({
    id: withBrand(`${program.id}:${String(step.id)}:${Date.now()}`, 'ControlCommandId'),
    command: mapStepToCommand(step.command),
    runId: withBrand(`${program.id}`, 'ControlPlaneRunId'),
    stepId: step.id,
    createdAt: new Date().toISOString(),
    expiresAt: undefined,
  }));

const knownCommands = new Set(['snapshot', 'analyze', 'gate', 'deploy', 'verify', 'rollback', 'seal']);
const mapStepToCommand = (value: string): ControlPlaneCommand['command'] =>
  knownCommands.has(value) ? (value as ControlPlaneCommand['command']) : 'deploy';

const mapDependencies = (program: RecoveryProgram): Map<StepId, StepMetadata> => {
  const map = new Map<StepId, StepMetadata>();
  for (const step of program.steps) {
    map.set(step.id, {
      stepId: step.id,
      commandType: step.command,
      dependencies: new Set(step.dependencies),
    });
  }
  return map;
};

const rootNodes = (dependencies: Map<StepId, StepMetadata>): readonly StepId[] =>
  [...dependencies.entries()]
    .filter(([, node]) => node.dependencies.size === 0)
    .map(([id]) => id);

const terminalNodes = (dependencies: Map<StepId, StepMetadata>): readonly StepId[] => {
  const dependencyMap = new Map<StepId, number>();
  for (const id of dependencies.keys()) {
    dependencyMap.set(id, 0);
  }

  for (const node of dependencies.values()) {
    for (const dep of node.dependencies) {
      dependencyMap.set(dep, (dependencyMap.get(dep) ?? 0) + 1);
    }
  }

  return [...dependencyMap.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
};

export const buildGraph = (program: RecoveryProgram, options: TopologyBuildOptions): ControlPlaneGraph => {
  const stepMap = mapDependencies(program);
  const edges: ControlPlaneEdge[] = [];
  for (const [to, node] of stepMap.entries()) {
    for (const from of node.dependencies) {
      edges.push({ from, to, weight: 1 });
    }
  }

  const orderedRootNodes = rootNodes(stepMap);
  const orderedTerminalNodes = terminalNodes(stepMap);
  const weightedEdges = options.disallowCycles
    ? edges.filter((edge) => edge.weight > 0 && edge.weight <= options.maxWeight)
    : edges;

  return {
    runId: withBrand(program.id as string, 'ControlPlaneRunId'),
    nodes: [...stepMap.keys()],
    edges: weightedEdges,
    rootNodes: orderedRootNodes,
    terminalNodes: orderedTerminalNodes,
  };
};

const hasAllDependenciesResolved = (
  current: ReadonlySet<StepId>,
  node: StepMetadata,
): boolean => {
  for (const dep of node.dependencies) {
    if (!current.has(dep)) {
      return false;
    }
  }

  return true;
};

export const buildExecutionLayers = (graph: ControlPlaneGraph): StepId[][] => {
  const index = new Map<StepId, ReadonlySet<StepId>>();
  const incoming = new Map<StepId, Set<StepId>>();
  for (const node of graph.nodes) {
    index.set(node, new Set(graph.edges.filter((edge) => edge.to === node).map((edge) => edge.from)));
    incoming.set(node, new Set());
  }
  for (const edge of graph.edges) {
    incoming.get(edge.to)?.add(edge.from);
  }

  const executed = new Set<StepId>();
  const nodeData = new Map<StepId, StepMetadata>();
  for (const node of graph.nodes) {
    nodeData.set(node, {
      stepId: node,
      commandType: 'deploy',
      dependencies: incoming.get(node) ? new Set(incoming.get(node)) : new Set(),
    });
  }

  const layers: StepId[][] = [];
  const frontier = graph.nodes.filter((node) => nodeData.get(node)?.dependencies.size === 0);
  let safety = 0;

  while (frontier.length > 0 && safety < 1_000) {
    const layer: StepId[] = [];
    for (const candidate of frontier.splice(0)) {
      if (executed.has(candidate)) {
        continue;
      }

      const metadata = nodeData.get(candidate);
      if (!metadata || !hasAllDependenciesResolved(executed, metadata)) {
        continue;
      }

      executed.add(candidate);
      layer.push(candidate);

      for (const outgoing of graph.edges.filter((edge) => edge.from === candidate)) {
        const nextMeta = nodeData.get(outgoing.to);
        (nextMeta?.dependencies as Set<StepId>)?.delete(candidate);
        if (nextMeta && nextMeta.dependencies.size === 0) {
          frontier.push(outgoing.to);
        }
      }
    }

    if (layer.length > 0) {
      layers.push(layer);
    } else {
      break;
    }

    safety += 1;
  }

  return layers;
};

export const planCriticalPath = (graph: ControlPlaneGraph): readonly StepId[] => {
  const layers = buildExecutionLayers(graph);
  return layers.flat();
};

export const graphDiagnostics = (program: RecoveryProgram, graph: ControlPlaneGraph): TopologyDiagnostics => {
  const start = Date.now();
  const criticalPath = planCriticalPath(graph);
  const edges = new Set(graph.edges.map((edge) => `${String(edge.from)}::${String(edge.to)}`));
  const expectedMax = Math.max(graph.nodes.length, 1);
  const expectedMin = Math.min(graph.nodes.length, 1);
  const parallelism = Number((expectedMax / expectedMin).toFixed(2));
  const cycleDetected = criticalPath.length < graph.nodes.length;
  const unreachableCount = graph.nodes.filter((node) => !criticalPath.includes(node)).length;

  return {
    unreachableCount,
    cycleDetected,
    parallelism,
    spanMs: Date.now() - start,
  };
};

export const scheduleWindowFromGraph = (graph: ControlPlaneGraph, cadenceMinutes: number): PlanSchedule => {
  const start = Date.now();
  return {
    planId: withBrand(String(graph.runId), 'RunPlanId'),
    windows: graph.nodes.map((node, index) => {
      const windowStart = start + index * cadenceMinutes * 60_000;
      return {
        label: String(node),
        startsAt: new Date(windowStart).toISOString(),
        endsAt: new Date(windowStart + cadenceMinutes * 60_000).toISOString(),
      };
    }),
    cadenceMinutes: Math.max(1, Math.floor(cadenceMinutes)),
  };
};
