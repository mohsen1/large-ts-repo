import { Optionalize } from '@shared/type-level';

import type { RecoveryProgram, RecoveryStep, RecoveryConstraint, RecoveryRunState } from './types';

export type RecoveryPriorityLane = 'gold' | 'silver' | 'bronze';

export interface RecoveryExecutionLane {
  readonly label: RecoveryPriorityLane;
  readonly stepIds: readonly string[];
  readonly parallelism: number;
  readonly requiredApprovals: number;
}

export interface RecoveryChain {
  readonly runId: RecoveryRunState['runId'];
  readonly lanes: readonly RecoveryExecutionLane[];
  readonly totalSteps: number;
  readonly hasRiskyDependency: boolean;
}

export interface LaneForecast {
  readonly lane: RecoveryExecutionLane;
  readonly estimatedMinutes: number;
  readonly completionRisk: number;
}

export interface ChainPlan {
  readonly programId: RecoveryProgram['id'];
  readonly lanes: readonly LaneForecast[];
  readonly sequence: readonly string[];
  readonly summary: {
    readonly totalApprovals: number;
    readonly riskIndex: number;
    readonly estimatedDurationMinutes: number;
  };
}

interface GraphNode {
  readonly id: RecoveryStep['id'];
  readonly step: RecoveryStep;
  readonly dependents: Set<string>;
  readonly indegree: number;
  readonly lane: RecoveryPriorityLane;
}

const deriveLane = (priority: RecoveryConstraint['threshold']): RecoveryPriorityLane => {
  if (priority > 0.8) return 'gold';
  if (priority > 0.4) return 'silver';
  return 'bronze';
};

const buildGraph = (steps: readonly RecoveryStep[], constraints: readonly RecoveryConstraint[]): Map<string, GraphNode> => {
  const nodes = new Map<string, GraphNode>();
  for (const step of steps) {
    const threshold = constraints.find((constraint) => constraint.name === step.id)?.threshold ?? 0.2;
    nodes.set(step.id, {
      id: step.id,
      step,
      dependents: new Set<string>(),
      indegree: 0,
      lane: deriveLane(threshold),
    });
  }

  for (const step of steps) {
    const current = nodes.get(step.id);
    if (!current) continue;

    for (const dependency of step.dependencies) {
      const dependencyNode = nodes.get(dependency);
      if (!dependencyNode) continue;
      dependencyNode.dependents.add(step.id);
      current.indegree ? undefined : undefined;
      const target = nodes.get(step.id);
      if (target) {
        target.indegree;
      }
    }
  }

  for (const step of steps) {
    const node = nodes.get(step.id);
    if (!node) continue;
    let inDegree = 0;
    for (const dependency of step.dependencies) {
      if (nodes.has(dependency)) {
        inDegree += 1;
      }
    }
    nodes.set(step.id, { ...node, indegree: inDegree });
  }
  return nodes;
};

const drain = (
  pending: Map<string, GraphNode>,
  nodes: Map<string, GraphNode>,
  lane: RecoveryPriorityLane,
): string[] => {
  const queue: string[] = [];
  for (const [id, node] of pending.entries()) {
    if (node.indegree === 0 && node.lane === lane) {
      queue.push(id);
    }
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const node = pending.get(current);
    if (!node || node.indegree > 0) continue;
    pending.delete(current);
    order.push(current);
    for (const childId of node.dependents) {
      const child = pending.get(childId);
      if (!child) continue;
      const next = {
        ...child,
        indegree: Math.max(0, child.indegree - 1),
      };
      pending.set(childId, next);
      if (next.indegree === 0) {
        queue.push(childId);
      }
    }
  }
  return order;
};

const buildLanes = (program: RecoveryProgram): RecoveryExecutionLane[] => {
  const nodes = buildGraph(program.steps, program.constraints);
  const residual = new Map(nodes);
  const lanes: RecoveryExecutionLane[] = [];
  const laneOrder: RecoveryPriorityLane[] = ['gold', 'silver', 'bronze'];

  for (const lane of laneOrder) {
    const stepIds: string[] = [];
    while (residual.size > 0) {
      const next = drain(residual, nodes, lane);
      if (next.length === 0) break;
      stepIds.push(...next);
    }
    lanes.push({
      label: lane,
      stepIds,
      parallelism: Math.max(1, Math.min(4, new Set(stepIds).size)),
      requiredApprovals: stepIds.reduce((sum, stepId) => {
        const step = program.steps.find((candidate) => candidate.id === stepId);
        return sum + (step?.requiredApprovals ?? 0);
      }, 0),
    });
  }

  const remaining = Array.from(residual.keys());
  if (remaining.length > 0) {
    lanes.push({
      label: 'bronze',
      stepIds: remaining,
      parallelism: 1,
      requiredApprovals: remaining.reduce((sum, stepId) => {
        const step = program.steps.find((candidate) => candidate.id === stepId);
        return sum + (step?.requiredApprovals ?? 0);
      }, 0),
    });
  }

  return lanes.filter((entry) => entry.stepIds.length > 0);
};

const estimateLaneMinutes = (program: RecoveryProgram, lane: RecoveryExecutionLane): number => {
  return lane.stepIds.reduce((sum, stepId) => {
    const step = program.steps.find((candidate) => candidate.id === stepId);
    return sum + (step ? Math.max(1, Math.ceil(step.timeoutMs / 60000)) : 0);
  }, 0);
};

const estimateCompletionRisk = (lane: RecoveryExecutionLane): number => {
  const approvalIntensity = lane.requiredApprovals / Math.max(1, lane.stepIds.length);
  const parallelPenalty = 1 / Math.max(1, lane.parallelism);
  const score = Math.max(0, approvalIntensity * 0.65 + parallelPenalty * 0.35);
  return Number(score.toFixed(4));
};

export const buildRecoveryChain = (program: RecoveryProgram, runState: RecoveryRunState): RecoveryChain => {
  const lanes = buildLanes(program);
  const hasRiskyDependency = lanes.some((lane) => lane.requiredApprovals > lane.stepIds.length * 1.5);
  const normalizedRunId = runState.runId as RecoveryRunState['runId'];
  return {
    runId: normalizedRunId,
    lanes,
    totalSteps: program.steps.length,
    hasRiskyDependency,
  };
};

export const mapChainToPlan = (program: RecoveryProgram, runState: RecoveryRunState): ChainPlan => {
  const chain = buildRecoveryChain(program, runState);
  const laneForecasts = chain.lanes.map((lane) => ({
    lane,
    estimatedMinutes: estimateLaneMinutes(program, lane),
    completionRisk: estimateCompletionRisk(lane),
  }));
  const sequence = laneForecasts.flatMap((entry) => entry.lane.stepIds);

  const totalApprovals = laneForecasts.reduce((sum, entry) => sum + entry.lane.requiredApprovals, 0);
  const riskIndex = Number((laneForecasts.reduce((sum, entry) => sum + entry.completionRisk, 0) / Math.max(1, laneForecasts.length)).toFixed(4));
  const estimatedDurationMinutes = laneForecasts.reduce((sum, entry) => sum + entry.estimatedMinutes, 0);

  return {
    programId: program.id,
    lanes: laneForecasts,
    sequence,
    summary: {
      totalApprovals,
      riskIndex,
      estimatedDurationMinutes,
    },
  };
};

export type PlanBlueprint = Optionalize<ChainPlan, 'sequence'>;
