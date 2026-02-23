import type {
  ExecutionPlan,
  IncidentGraph,
  PlannerConfig,
  PlannerInstruction,
  PlannerOutput,
  PlannerTrace,
  PlannerProfile,
} from './types';
import { calculateReadinessScore } from './analysis';
import { topologicalLevels } from './graph';
import { analyzeCriticalPath } from './analysis';

const nextId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const now = (): string => new Date().toISOString();

const defaultProfile = (graph: IncidentGraph): PlannerProfile => ({
  id: `${graph.meta.id}-profile` as any,
  tenantId: graph.meta.tenantId,
  profileName: 'default',
  maxParallelism: Math.max(1, Math.ceil(graph.nodes.length / 3)),
  minReadinessWindowMinutes: 10,
  allowOverrides: true,
  allowReentrance: false,
});

const byPriority = (left: PlannerInstruction, right: PlannerInstruction): number => left.phase - right.phase;

const buildInstructions = (
  graph: IncidentGraph,
  ordering: PlannerConfig['preferredOrdering'],
  traces: PlannerTrace[],
): readonly PlannerInstruction[] => {
  const levels = topologicalLevels(graph);
  const critical = analyzeCriticalPath(graph);
  const byCriticalNode = new Set<string>(critical.flatMap((edge) => [edge.from, edge.to]));

  const sorted = [...levels];
  if (ordering === 'criticality') {
    sorted.sort((left, right) => {
      const leftScore = byCriticalNode.has(left.nodeId) ? 1 : 0;
      const rightScore = byCriticalNode.has(right.nodeId) ? 1 : 0;
      return rightScore - leftScore;
    });
  }

  return sorted.flatMap((visit, index) => {
    const node = graph.nodes.find((candidate) => candidate.id === visit.nodeId);
    if (!node) {
      return [];
    }
    const startAtOffsetMinutes = visit.level * 5;
    const instruction: PlannerInstruction = {
      nodeId: node.id,
      phase: visit.level,
      startAtOffsetMinutes,
      reason: `level=${visit.level} state=${node.state}`,
      prerequisites: [...node.dependsOn],
      risks: {
        green: 0,
        yellow: Math.min(1, index / Math.max(1, sorted.length)),
        orange: 0.2,
        red: node.score / 100,
      },
    };

    traces.push({
      attempt: index + 1,
      nodeId: node.id,
      message: `instruction:${node.id}`,
      at: now(),
    });

    return [instruction];
  });
}

const estimateDuration = (instructions: readonly PlannerInstruction[]): number => {
  if (instructions.length === 0) {
    return 0;
  }
  const groups = new Map<number, number>();
  for (const instruction of instructions) {
    groups.set(instruction.phase, (groups.get(instruction.phase) ?? 0) + 1);
  }
  return [...groups.values()].reduce((acc, bucketSize) => acc + Math.ceil(4 + bucketSize * 2), 0);
};

export const createPlan = (graph: IncidentGraph, config: Partial<PlannerConfig>): PlannerOutput => {
  const traces: PlannerTrace[] = [];
  const baseConfig: PlannerConfig = {
    id: `${graph.meta.id}-planner` as PlannerConfig['id'],
    profile: defaultProfile(graph),
    graphWindowMinutes: 90,
    signalGraceMinutes: 8,
    failureTolerancePercent: 10,
    maxRetries: 2,
    preferredOrdering: 'criticality-first',
    ...config,
  };

  const instructions = buildInstructions(graph, baseConfig.preferredOrdering, traces);
  const readinessScore = calculateReadinessScore(graph);

  const plan: ExecutionPlan = {
    id: `${graph.meta.id}-plan` as ExecutionPlan['id'],
    graphId: graph.meta.id,
    issuedAt: now(),
    instructions,
    estimatedDurationMinutes: estimateDuration(instructions),
  };

  traces.push({
    attempt: instructions.length + 1,
    nodeId: graph.nodes[0]?.id ?? ('' as PlannerInstruction['nodeId']),
    message: `readiness=${readinessScore}`,
    at: now(),
  });

  return {
    planId: plan.id,
    plan,
    traces,
  };
};

export const mutateOrdering = (
  output: PlannerOutput,
  strategy: 'fifo' | 'alpha' | 'reverse-alpha',
): PlannerOutput => {
  const instructions = [...output.plan.instructions];
  if (strategy === 'alpha') {
    instructions.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  }
  if (strategy === 'reverse-alpha') {
    instructions.sort((left, right) => right.nodeId.localeCompare(left.nodeId));
  }

  return {
    ...output,
    plan: {
      ...output.plan,
      instructions,
      estimatedDurationMinutes: estimateDuration(instructions),
    },
  };
};

export const planToGraphText = (output: PlannerOutput): string => {
  const lines = output.plan.instructions.map(
    (instruction) => `${instruction.phase},${instruction.nodeId},${instruction.startAtOffsetMinutes},${instruction.reason}`,
  );
  return `plan=${output.planId}\n${lines.join('\n')}`;
};
