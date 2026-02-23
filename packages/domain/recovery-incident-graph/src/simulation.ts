import { randomUUID } from 'crypto';

import type {
  IncidentGraph,
  IncidentNodeId,
  ReadinessSignal,
  SimulationResult,
  SimulationScenario,
  SimulationSummary,
} from './types';
import { calculateReadinessCoverageMetrics, topologicalLevels } from './graph';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const makeFrame = (
  runId: SimulationResult['runId'],
  graphId: IncidentGraph['meta']['id'],
  index: number,
  completed: readonly IncidentNodeId[],
  blocked: readonly IncidentNodeId[],
): SimulationResult['frames'][number] => ({
  runId,
  graphId,
  index,
  at: new Date().toISOString(),
  completedNodeIds: completed,
  blockedNodeIds: blocked,
});

const getSignalValue = (nodeId: IncidentNodeId, signals: readonly ReadinessSignal[]): number => {
  return signals
    .filter((signal) => signal.targetNodeId === nodeId)
    .reduce((sum, signal) => sum + signal.value, 0);
};

export const simulateNodeReadiness = (nodeScore: number, signals: readonly ReadinessSignal[], nodeId: IncidentNodeId): number => {
  const boost = getSignalValue(nodeId, signals);
  const normalized = clamp(nodeScore / 100 + boost, 0, 1);
  return Math.round(normalized * 100);
};

export const simulateNodeCompletion = (
  graph: IncidentGraph,
  nodeId: IncidentNodeId,
  signals: readonly ReadinessSignal[],
): boolean => {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return false;
  }

  if (node.state === 'failed' || node.state === 'cancelled') {
    return false;
  }

  const blockedByDependencies = node.dependsOn.some((dependencyId) => {
    const dependency = graph.nodes.find((candidate) => candidate.id === dependencyId);
    return dependency && dependency.state !== 'complete';
  });
  if (blockedByDependencies) {
    return false;
  }

  const readiness = simulateNodeReadiness(node.score, signals, node.id);
  const noise = (graph.meta.ownerTeam.length + node.durationMinutes) % 7;
  const threshold = Math.max(50, 100 - noise * 5);
  return readiness >= threshold;
};

const tick = (graph: IncidentGraph, signals: readonly ReadinessSignal[]): readonly IncidentNodeId[] => {
  return graph.nodes
    .filter((node) => simulateNodeCompletion(graph, node.id, signals))
    .map((node) => node.id);
};

export const inspectReachability = (graph: IncidentGraph, source: IncidentNodeId): readonly IncidentNodeId[] => {
  const reachable = new Set<IncidentNodeId>([source]);
  const todo = [source];

  while (todo.length > 0) {
    const current = todo.pop();
    if (!current) continue;
    const outgoing = graph.edges.filter((edge) => edge.fromNodeId === current).map((edge) => edge.toNodeId);
    for (const next of outgoing) {
      if (!reachable.has(next)) {
        reachable.add(next);
        todo.push(next);
      }
    }
  }

  return [...reachable];
};

export const simulateWithSeed = (scenario: SimulationScenario): SimulationResult => {
  const runId = randomUUID() as SimulationResult['runId'];
  const frames: Array<SimulationResult['frames'][number]> = [];
  const visited = new Set<IncidentNodeId>();

  const levels = topologicalLevels(scenario.graph);
  let tickIndex = 0;
  while (tickIndex < scenario.maxTicks) {
    const completed = tick(scenario.graph, scenario.signals);
    const next = completed.filter((nodeId) => !visited.has(nodeId));
    for (const item of next) {
      visited.add(item);
    }
    const blocked = levels
      .map((visit) => scenario.graph.nodes.find((node) => node.id === visit.nodeId)?.state === 'blocked')
      .map((_, index) => scenario.graph.nodes[index]?.id)
      .filter((id): id is IncidentNodeId => Boolean(id));

    frames.push(makeFrame(runId, scenario.graph.meta.id, tickIndex, [...visited], blocked));
    if (next.length === 0 && visited.size >= scenario.graph.nodes.length * 0.85) {
      break;
    }
    tickIndex += 1;
  }

  const metrics = calculateReadinessCoverageMetrics(scenario.graph);
  const summary: SimulationSummary = {
    triggeredSignals: scenario.signals.map((signal) => signal.id),
    failedNodeCount: scenario.graph.nodes.filter((node) => node.state === 'failed').length,
    warningNodeCount: scenario.graph.nodes.filter((node) => node.state === 'warning').length,
    completedNodeCount: visited.size,
    totalRiskPoints: Math.round(metrics.riskReduction),
  };

  return {
    runId,
    graphId: scenario.graph.meta.id,
    success: summary.completedNodeCount > 0,
    frames,
    maxDepth: Math.max(0, ...levels.map((visit) => visit.level)),
    predictedDowntimeMinutes: Math.max(0, (scenario.graph.nodes.length - visited.size) * 4),
    summary,
    metrics,
  };
};

export const simulateGraph = (graph: IncidentGraph, signals: readonly ReadinessSignal[], maxTicks = 12): SimulationResult =>
  simulateWithSeed({
    scenarioId: `${graph.meta.id}-default`,
    graph,
    signals,
    maxTicks,
  });
