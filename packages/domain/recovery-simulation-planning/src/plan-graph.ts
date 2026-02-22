import type { ScenarioBlueprint, ScenarioStep } from './types';

export type PlanRank = 'critical' | 'important' | 'normal';
export interface PlanNode {
  readonly id: string;
  readonly step: ScenarioStep;
  readonly incoming: readonly string[];
  outgoing: readonly string[];
}

export interface PlanGraph {
  readonly nodes: readonly PlanNode[];
  readonly adjacency: Map<string, readonly string[]>;
  readonly indegree: Map<string, number>;
}

export interface RankDecision {
  readonly stepId: string;
  readonly rank: PlanRank;
  readonly score: number;
  readonly blockers: readonly string[];
}

const phaseWeight = (phase: ScenarioStep['phase']) => {
  switch (phase) {
    case 'preflight':
      return 4;
    case 'injection':
      return 5;
    case 'failover':
      return 3;
    case 'recovery':
      return 2;
    case 'verification':
      return 1;
    default:
      return 1;
  }
};

const buildMap = <T>(entries: readonly [string, T][]) => new Map(entries);

export const buildPlanGraph = (blueprint: ScenarioBlueprint): PlanGraph => {
  const nodes: PlanNode[] = [];
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const step of blueprint.steps) {
    nodes.push({
      id: step.id,
      step,
      incoming: step.dependencies,
      outgoing: [],
    });
    indegree.set(step.id, 0);
  }

  for (const step of blueprint.steps) {
    for (const dependency of step.dependencies) {
      adjacency.set(dependency, (adjacency.get(dependency) ?? new Set()).add(step.id));
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
    }
  }

  for (const entry of adjacency.entries()) {
    const outgoing = [...entry[1]];
    for (const node of nodes) {
      if (node.id === entry[0]) {
        node.outgoing = outgoing;
      }
    }
  }

  return {
    nodes,
    adjacency: buildMap([...adjacency].map(([id, value]) => [id, [...value]])),
    indegree: buildMap([...indegree].map(([id, value]) => [id, value])),
  };
};

export const topologicalOrder = (blueprint: ScenarioBlueprint): readonly string[] => {
  const { adjacency, indegree } = buildPlanGraph(blueprint);
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const output: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    output.push(current);

    for (const next of adjacency.get(current) ?? []) {
      const currentDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, currentDegree);
      if (currentDegree === 0) {
        queue.push(next);
      }
    }
  }

  const unresolved = [...indegree.entries()].filter(([, degree]) => degree > 0).map(([id]) => id);
  return [...output, ...unresolved];
};

export const rankPlan = (blueprint: ScenarioBlueprint): readonly RankDecision[] => {
  const order = topologicalOrder(blueprint);
  const byId = new Map<string, ScenarioStep>(blueprint.steps.map((step) => [step.id, step]));
  const stepRank = new Map<string, PlanRank>();

  for (const stepId of order) {
    const step = byId.get(stepId);
    if (!step) continue;
    const hasDependencies = step.dependencies.length > 0;
    const critical = step.constraints.length > 3 || hasDependencies || phaseWeight(step.phase) >= 4;
    const important = step.expectedMinutes > 30 || step.command.includes('failover');

    if (critical) {
      stepRank.set(stepId, 'critical');
    } else if (important) {
      stepRank.set(stepId, 'important');
    } else {
      stepRank.set(stepId, 'normal');
    }
  }

  return order.map((stepId) => {
    const step = byId.get(stepId)!;
    const blockers = step.dependencies.filter((dependency) => !order.includes(dependency));
    const rank = stepRank.get(stepId) ?? 'normal';
    return {
      stepId,
      rank,
      score: phaseWeight(step.phase) * (1 + step.expectedMinutes / 10),
      blockers,
    };
  });
};
