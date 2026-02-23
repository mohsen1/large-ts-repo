import type { IncidentGraph, ValidationIssue, ValidationOutcome, ReadinessSignal, PlannerInstruction } from './types';
import { hasCycle } from './graph';

const issue = (path: readonly (string | number)[], message: string, severity: ValidationIssue['severity']): ValidationIssue => ({
  path,
  message,
  severity,
});

const nodeById = (graph: IncidentGraph, nodeId: string) => graph.nodes.find((node) => node.id === nodeId);

const duplicates = <T>(items: readonly T[]): readonly T[] => Array.from(new Set(items));

export const validateNodes = (graph: IncidentGraph): ValidationIssue[] => {
  const scoreIssues = graph.nodes.flatMap((node) => {
    if (node.score < 0 || node.score > 100) {
      return [issue([`nodes`, node.id, 'score'], `score out of range: ${node.score}`, 'error')];
    }
    return [];
  });

  const dependencyIssues = graph.nodes.flatMap((node) =>
    node.dependsOn
      .filter((dependencyId) => !nodeById(graph, dependencyId))
      .map((dependencyId) =>
        issue([`nodes`, node.id, 'dependsOn', dependencyId], `dependency ${dependencyId} does not exist`, 'error'),
      ),
  );

  return [...scoreIssues, ...dependencyIssues];
};

export const validateEdges = (graph: IncidentGraph): ValidationIssue[] => {
  const duplicatesInGraph = duplicates(graph.edges.map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`));
  const duplicatesSet = duplicates(graph.edges.map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`));
  const map = new Map<string, number>();
  for (const key of duplicatesSet) {
    map.set(key, map.get(key) ?? 0);
  }
  graph.edges.forEach((edge) => {
    const key = `${edge.fromNodeId}->${edge.toNodeId}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  });

  const repeated = [...map.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => issue([`edges`, key], `duplicate edge detected: ${key}`, 'warning'));

  const weightIssues = graph.edges
    .filter((edge) => edge.weight <= 0)
    .map((edge) =>
      issue([`edges`, edge.fromNodeId, edge.toNodeId], `edge weight must be positive (got ${edge.weight})`, 'warning'),
    );

  const selfLoopIssues = graph.edges
    .filter((edge) => edge.fromNodeId === edge.toNodeId)
    .map((edge) => issue([`edges`, edge.fromNodeId, edge.toNodeId], 'self loop found', 'error'));

  return [...repeated, ...weightIssues, ...selfLoopIssues];
};

export const validateInstructions = (graph: IncidentGraph, instructions: readonly PlannerInstruction[]): ValidationOutcome => {
  const duplicated = new Set(duplicates(instructions.map((instruction) => instruction.nodeId)));
  const instructionIssues = instructions
    .filter((instruction) => duplicated.has(instruction.nodeId))
    .map((instruction) => issue([`instructions`, instruction.nodeId], `duplicate node scheduled: ${instruction.nodeId}`, 'error'));

  const missingNodes = instructions
    .filter((instruction) => !nodeById(graph, instruction.nodeId))
    .map((instruction) =>
      issue([`instructions`, instruction.nodeId], `instruction references unknown node ${instruction.nodeId}`, 'error'),
    );

  const issues = [...instructionIssues, ...missingNodes];

  return {
    graphId: graph.meta.id,
    valid: issues.every((entry) => entry.severity !== 'error'),
    issues,
  };
};

export const validateSignals = (signals: readonly ReadinessSignal[]): ValidationOutcome => {
  const issues = signals
    .filter((signal) => signal.value < 0 || signal.value > 1)
    .map((signal) => issue([`signals`, signal.id], `signal value out of range: ${signal.value}`, 'warning'));

  return {
    graphId: 'signals' as IncidentGraph['meta']['id'],
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
};

export const validateGraph = (graph: IncidentGraph): ValidationOutcome => {
  const issues = [...validateNodes(graph), ...validateEdges(graph)];
  if (hasCycle(graph)) {
    issues.push(issue(['edges'], 'graph contains cycle', 'error'));
  }
  return {
    graphId: graph.meta.id,
    valid: issues.every((entry) => entry.severity !== 'error'),
    issues,
  };
};
