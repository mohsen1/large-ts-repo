import type {
  CommandSurfaceId,
  SurfaceDependency,
  SurfacePlan,
  ActionKind,
  SurfaceActionTemplate,
} from './types';

export type GraphEdge = SurfaceDependency;

export interface PlanNode {
  readonly id: CommandSurfaceId;
  readonly kind: ActionKind;
  readonly risk: number;
  readonly command: SurfaceActionTemplate;
  readonly outgoing: ReadonlyArray<CommandSurfaceId>;
  readonly incoming: ReadonlyArray<CommandSurfaceId>;
}

export interface PlanGraph {
  readonly nodes: ReadonlyMap<CommandSurfaceId, PlanNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
  readonly order: readonly CommandSurfaceId[];
}

export const createPlanGraph = (plan: SurfacePlan): PlanGraph => {
  const nodes = new Map<CommandSurfaceId, PlanNode>();
  for (const command of plan.commands) {
    nodes.set(command.id, {
      id: command.id,
      kind: command.kind,
      risk: command.inputs.reduce((total, input) => total + (typeof input.priority === 'number' ? input.priority : 0), 0),
      command,
      outgoing: [],
      incoming: [],
    });
  }

  for (const edge of plan.dependencies) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) {
      continue;
    }
    nodes.set(edge.from, {
      ...from,
      outgoing: [...from.outgoing, edge.to],
    });
    nodes.set(edge.to, {
      ...to,
      incoming: [...to.incoming, edge.from],
    });
  }

  const nodeOrder = topoSort(nodes, plan.dependencies);
  return {
    nodes,
    edges: plan.dependencies,
    order: nodeOrder,
  };
};

const topoSort = (
  nodes: Map<CommandSurfaceId, PlanNode>,
  edges: ReadonlyArray<GraphEdge>,
): readonly CommandSurfaceId[] => {
  const inDegree = new Map<CommandSurfaceId, number>();
  for (const key of nodes.keys()) {
    inDegree.set(key, 0);
  }
  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: CommandSurfaceId[] = [];
  for (const [id, count] of inDegree) {
    if (count === 0) queue.push(id);
  }

  const resolved: CommandSurfaceId[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    resolved.push(current);
    const node = nodes.get(current);
    if (!node) continue;
    for (const next of node.outgoing) {
      const nextCount = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextCount);
      if (nextCount <= 0) {
        queue.push(next);
      }
    }
  }

  const unresolved = [...nodes.keys()].filter((id) => !resolved.includes(id));
  if (unresolved.length > 0) {
    return [...resolved, ...unresolved];
  }
  return resolved;
};

export const getDownstream = (graph: PlanGraph, nodeId: CommandSurfaceId): readonly CommandSurfaceId[] => {
  const visited = new Set<CommandSurfaceId>();
  const output: CommandSurfaceId[] = [];
  const walk = (id: CommandSurfaceId): void => {
    const node = graph.nodes.get(id);
    if (!node) return;
    for (const next of node.outgoing) {
      if (visited.has(next)) continue;
      visited.add(next);
      output.push(next);
      walk(next);
    }
  };
  walk(nodeId);
  return output;
};

export const getCriticalPath = (graph: PlanGraph): readonly CommandSurfaceId[] => {
  if (graph.order.length === 0) {
    return [];
  }
  const ranks = new Map<CommandSurfaceId, number>();
  for (const id of graph.order) {
    const node = graph.nodes.get(id);
    if (!node) continue;
    const incomingScores = node.incoming.map((incoming) => ranks.get(incoming) ?? 0);
    const parentMax = incomingScores.length === 0 ? 0 : Math.max(...incomingScores);
    ranks.set(id, parentMax + Math.max(1, node.risk));
  }
  const maxScore = Math.max(...ranks.values());
  return [...ranks.entries()]
    .filter(([, score]) => score === maxScore)
    .map(([id]) => id);
};
