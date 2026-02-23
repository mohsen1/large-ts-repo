import type { RecoveryPlan, ScenarioAction, ScenarioConstraint } from '../types';

export interface DependencyLink {
  readonly from: ScenarioAction['id'];
  readonly to: ScenarioAction['id'];
  readonly reason: string;
}

export interface ExecutionGraph {
  readonly planId: RecoveryPlan['id'];
  readonly nodes: readonly ScenarioAction['id'][];
  readonly links: readonly DependencyLink[];
  readonly tags: Record<string, readonly string[]>;
}

export interface GraphBuildInput {
  readonly plan: RecoveryPlan;
  readonly constraints: readonly ScenarioConstraint[];
}

export interface ExecutionStep {
  readonly action: ScenarioAction;
  readonly inbound: readonly ScenarioAction['id'][];
  readonly outbound: readonly ScenarioAction['id'][];
}

export interface ExecutionOrder {
  readonly steps: readonly ExecutionStep[];
  readonly stalled: readonly ScenarioAction['id'][];
  readonly cycleDetected: boolean;
}

const dependencyTag = (action: ScenarioAction): readonly string[] => [
  ...action.tags,
  `owner:${action.owner}`,
  `requiredApprovals:${action.requiredApprovals}`,
];

const sameAction = (left: ScenarioAction['id'], right: ScenarioAction['id']): boolean => left === right;

const hasDependency = (links: readonly DependencyLink[], from: ScenarioAction['id'], to: ScenarioAction['id']): boolean => {
  return links.some((link) => link.from === from && link.to === to);
};

export const buildExecutionGraph = (input: GraphBuildInput): ExecutionGraph => {
  const constraintLinks: DependencyLink[] = [];

  input.constraints.forEach((constraint, index) => {
    const to = input.plan.actions[index % input.plan.actions.length]?.id;
    const from = input.plan.actions[(index + 1) % input.plan.actions.length]?.id;
    if (!to || !from || sameAction(from, to)) {
      return;
    }
    if (!hasDependency(constraintLinks, from, to)) {
      constraintLinks.push({
        from,
        to,
        reason: `${constraint.key} ${constraint.operator} ${constraint.threshold}`,
      });
    }
  });

  const actionLinks = input.plan.actions.flatMap((action, index) => {
    const next = input.plan.actions[index + 1];
    const from = action.id;
    if (!next || sameAction(from, next.id)) return [];
    const reason = `sequence:${index}->${index + 1}`;
    return hasDependency(constraintLinks, from, next.id)
      ? []
      : [{ from, to: next.id, reason }];
  });

  const links = [...constraintLinks, ...actionLinks];
  const tags: Record<string, readonly string[]> = {};
  for (const action of input.plan.actions) {
    tags[String(action.id)] = dependencyTag(action);
  }
  return {
    planId: input.plan.id,
    nodes: input.plan.actions.map((action) => action.id),
    links,
    tags,
  };
};

const normalizeLinks = (links: readonly DependencyLink[]): DependencyLink[] => {
  const normalized = new Map<string, DependencyLink>();
  for (const link of links) {
    const key = `${String(link.from)}:${String(link.to)}`;
    if (!normalized.has(key)) {
      normalized.set(key, link);
    }
  }
  return [...normalized.values()];
};

export const calculateInDegree = (nodes: readonly ScenarioAction['id'][], links: readonly DependencyLink[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const node of nodes) {
    out[String(node)] = 0;
  }
  for (const link of normalizeLinks(links)) {
    out[String(link.to)] = (out[String(link.to)] ?? 0) + 1;
  }
  return out;
};

const outgoing = (node: ScenarioAction['id'], links: readonly DependencyLink[]): ScenarioAction['id'][] => {
  return links.filter((link) => link.from === node).map((link) => link.to);
};

export const orderExecution = (graph: ExecutionGraph): ExecutionOrder => {
  const indegree = calculateInDegree(graph.nodes, graph.links);
  const queue = graph.nodes.filter((node) => (indegree[String(node)] ?? 0) === 0);

  const pending = new Map<ScenarioAction['id'], ExecutionStep>();
  for (const node of graph.nodes) {
    pending.set(node, {
      action: { id: node, code: '', title: '', owner: '', commandTemplate: '', requiredApprovals: 0, estimatedMinutes: 0, status: 'queued', tags: [] },
      inbound: [],
      outbound: [],
    });
  }

  const edges = normalizeLinks(graph.links);
  let cursor = 0;
  const steps: ExecutionStep[] = [];
  while (cursor < queue.length) {
    const actionId = queue[cursor];
    cursor += 1;
    const current = pending.get(actionId);
    const outboundNodes = outgoing(actionId, edges);

    if (current) {
      steps.push({
        ...current,
        inbound: graph.links.filter((link) => link.to === actionId).map((link) => link.from),
        outbound: outboundNodes,
      });
    }

    for (const next of outboundNodes) {
      indegree[String(next)] -= 1;
      if (indegree[String(next)] === 0) {
        queue.push(next);
      }
    }
  }

  const stalled = graph.nodes.filter((node) => !steps.some((step) => step.action.id === node));
  const cycleDetected = stalled.length > 0;
  return { steps, stalled, cycleDetected };
};

export const projectCriticalPath = (order: ExecutionOrder, planActions: readonly ScenarioAction[]): number => {
  if (order.cycleDetected) {
    return 0;
  }

  const byId = new Map<string, ScenarioAction>();
  for (const action of planActions) {
    byId.set(String(action.id), action);
  }

  return order.steps.reduce((acc, step) => {
    const action = byId.get(String(step.action.id));
    if (!action) return acc;
    return acc + action.estimatedMinutes + action.requiredApprovals;
  }, 0);
};
