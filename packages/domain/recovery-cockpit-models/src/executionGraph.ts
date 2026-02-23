import { RecoveryAction, RecoveryPlan } from './runtime';
import { EntityId, UtcIsoTimestamp } from './identifiers';

export type GraphNodeWeight = {
  readonly criticality: number;
  readonly parallelism: number;
  readonly estimatedWallClock: number;
};

export type GraphEdge = {
  readonly from: EntityId;
  readonly to: EntityId;
};

export type PlanExecutionGraph = {
  readonly planId: RecoveryPlan['planId'];
  readonly nodeOrder: readonly EntityId[];
  readonly adjacency: ReadonlyMap<EntityId, ReadonlyArray<EntityId>>;
  readonly reverseAdjacency: ReadonlyMap<EntityId, ReadonlyArray<EntityId>>;
  readonly layerCount: number;
  readonly edges: readonly GraphEdge[];
};

export type ExecutionMetrics = {
  readonly bottlenecks: ReadonlyArray<EntityId>;
  readonly longestPath: number;
  readonly layers: ReadonlyMap<number, ReadonlyArray<EntityId>>;
  readonly readyAt: UtcIsoTimestamp;
};

type GraphBuilder = {
  inDegree: Map<EntityId, number>;
  adjacency: Map<EntityId, Set<EntityId>>;
  reverseAdjacency: Map<EntityId, Set<EntityId>>;
};

const initializeGraph = (actions: readonly RecoveryAction[]): GraphBuilder => {
  const inDegree = new Map<EntityId, number>();
  const adjacency = new Map<EntityId, Set<EntityId>>();
  const reverseAdjacency = new Map<EntityId, Set<EntityId>>();

  for (const action of actions) {
    const actionId = action.id;
    inDegree.set(actionId, action.dependencies.length);
    adjacency.set(actionId, new Set());
    reverseAdjacency.set(actionId, new Set());
  }

  for (const action of actions) {
    for (const dependency of action.dependencies) {
      adjacency.get(dependency)?.add(action.id);
      reverseAdjacency.get(action.id)?.add(dependency);
      const current = inDegree.get(action.id) ?? 0;
      inDegree.set(action.id, current);
    }
  }

  return { inDegree, adjacency, reverseAdjacency };
};

const buildLayers = (
  inDegree: Map<EntityId, number>,
  adjacency: Map<EntityId, Set<EntityId>>,
): ReadonlyMap<number, ReadonlyArray<EntityId>> => {
  const ready: EntityId[] = [...inDegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const layers = new Map<number, EntityId[]>();
  let depth = 0;
  const workSet = new Set(ready);

  while (workSet.size > 0) {
    const current = [...workSet];
    workSet.clear();
    layers.set(depth, current);
    const next: EntityId[] = [];

    for (const node of current) {
      for (const nextNode of adjacency.get(node) ?? []) {
        const nextDegree = (inDegree.get(nextNode) ?? 0) - 1;
        inDegree.set(nextNode, nextDegree);
        if (nextDegree === 0) {
          next.push(nextNode);
        }
      }
    }

    for (const nextNode of next) {
      workSet.add(nextNode);
    }
    depth += 1;
  }

  return layers;
};

const computeLongestPath = (reverseAdjacency: Map<EntityId, Set<EntityId>>, start: EntityId, memo: Map<EntityId, number>): number => {
  if (memo.has(start)) {
    return memo.get(start) ?? 0;
  }

  const predecessors = [...(reverseAdjacency.get(start) ?? [])];
  if (predecessors.length === 0) {
    memo.set(start, 1);
    return 1;
  }

  const path = 1 + Math.max(...predecessors.map((candidate) => computeLongestPath(reverseAdjacency, candidate, memo)));
  memo.set(start, path);
  return path;
};

const toReadOnlyGraph = (
  adjacency: Map<EntityId, Set<EntityId>>,
  reverseAdjacency: Map<EntityId, Set<EntityId>>,
): ReadonlyMap<EntityId, ReadonlyArray<EntityId>> =>
  new Map(
    [...adjacency.entries()].map(([node, targets]) => [node, [...targets]]),
  );

export const buildExecutionGraph = (plan: RecoveryPlan): PlanExecutionGraph => {
  const { inDegree, adjacency, reverseAdjacency } = initializeGraph(plan.actions);
  const nodeOrder = [...inDegree.keys()];
  const layers = buildLayers(new Map(inDegree), adjacency);
  const edges: GraphEdge[] = [];
  for (const [from, tos] of adjacency) {
    for (const to of tos) {
      edges.push({ from, to });
    }
  }

  return {
    planId: plan.planId,
    nodeOrder,
    adjacency: toReadOnlyGraph(adjacency, reverseAdjacency),
    reverseAdjacency: toReadOnlyGraph(reverseAdjacency, adjacency),
    layerCount: Math.max(0, layers.size - 1),
    edges,
  };
};

const graphWeight = (action: RecoveryAction): GraphNodeWeight => ({
  criticality: action.tags.includes('critical') ? 3 : 1,
  parallelism: Math.max(1, action.retriesAllowed),
  estimatedWallClock: action.expectedDurationMinutes,
});

export const rankGraphBottlenecks = (plan: RecoveryPlan): ReadonlyArray<EntityId> => {
  const byWeight = [...plan.actions]
    .map((action) => ({ action, weight: graphWeight(action) }))
    .sort((left, right) => {
      const delta =
        right.weight.criticality * right.weight.parallelism + right.weight.estimatedWallClock - (left.weight.criticality * left.weight.parallelism + left.weight.estimatedWallClock);
      return delta;
    })
    .slice(0, 3)
    .map((entry) => entry.action.id);
  return byWeight;
};

export const measureExecutionMetrics = (plan: RecoveryPlan): ExecutionMetrics => {
  const graph = buildExecutionGraph(plan);
  const reverseAdjacency = new Map<EntityId, Set<EntityId>>(
    [...graph.reverseAdjacency.entries()].map(([key, values]) => [key, new Set(values)]),
  );
  const memo = new Map<EntityId, number>();
  const longestPath = [...graph.nodeOrder]
    .map((node) => computeLongestPath(reverseAdjacency, node, memo))
    .reduce((acc, value) => Math.max(acc, value), 0);
  const inDegree = new Map<EntityId, number>(
    [...graph.nodeOrder].map((id) => [id, (graph.reverseAdjacency.get(id) ?? []).length]),
  );
  const adjacency = new Map<EntityId, Set<EntityId>>(
    [...graph.edges].map((edge) => [edge.from, new Set([edge.to])]),
  );
  const layers = buildLayers(inDegree, adjacency);

  return {
    bottlenecks: rankGraphBottlenecks(plan),
    longestPath,
    layers,
    readyAt: new Date().toISOString() as UtcIsoTimestamp,
  };
};

export const findCriticalPath = (plan: RecoveryPlan): ReadonlyArray<EntityId> => {
  const graph = buildExecutionGraph(plan);
  const queue = graph.nodeOrder.filter((id) => (graph.reverseAdjacency.get(id) ?? []).length === 0);
  const selected: EntityId[] = [];
  const visited = new Set<EntityId>();
  const adjacency = new Map(graph.adjacency);
  const walk = (node: EntityId, depth: number) => {
    if (visited.has(node) || depth > 20) {
      return;
    }
    selected.push(node);
    visited.add(node);
    const neighbors = adjacency.get(node) ?? [];
    if (neighbors.length > 0) {
      neighbors.forEach((next) => walk(next, depth + 1));
    }
  };
  queue.forEach((node) => walk(node, 0));
  return selected;
};
