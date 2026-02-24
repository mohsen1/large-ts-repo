import type { ConvergencePlan, ConvergencePlanId, ConvergenceRunEvent, ConvergenceRunId, ConvergenceWorkspaceId } from './types';

export type PlanNode = ConvergencePlanId;
export type PlanEdge = readonly [PlanNode, PlanNode];
export type PlanGraph = {
  readonly nodes: readonly PlanNode[];
  readonly edges: readonly PlanEdge[];
};

type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer R] ? R : [];
type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;

type PathListBuilder<
  TGraph extends PlanGraph,
  TFrom extends PlanNode,
  TSeen extends readonly PlanNode[] = [],
> = TFrom extends TSeen[number]
  ? []
  : readonly [TFrom, ...PathListBuilder<
      TGraph,
      ExtractNext<TGraph, TFrom>,
      readonly [...TSeen, TFrom]
    >[]];

type ExtractNext<TGraph extends PlanGraph, TFrom extends PlanNode> = TGraph['edges'][number] extends PlanEdge
  ? TGraph['edges'][number] extends readonly [TFrom, infer TTo]
    ? TTo extends PlanNode
      ? TTo
      : never
    : never
  : never;

export type AllPaths<TGraph extends PlanGraph> = {
  [K in TGraph['nodes'][number]]: PathListBuilder<TGraph, K>;
};

export interface PlanGraphSnapshot {
  readonly nodes: readonly PlanNode[];
  readonly edges: readonly PlanEdge[];
  readonly pathCount: number;
  readonly eventLog: readonly ConvergenceRunEvent[];
}

const collectEdgesFrom = (graph: PlanGraph, from: PlanNode): readonly PlanNode[] =>
  graph.edges
    .filter((entry): entry is PlanEdge => entry[0] === from)
    .map((entry) => entry[1]);

const visited = new Set<string>();

const visit = (
  graph: PlanGraph,
  node: PlanNode,
  sink: PlanNode[],
  stack: readonly PlanNode[],
): PlanNode[] => {
  if (stack.includes(node)) {
    return sink;
  }
  const nextStack = [...stack, node];
  sink.push(node);

  const nexts = collectEdgesFrom(graph, node);
  for (const next of nexts) {
    if (!nextStack.includes(next)) {
      visit(graph, next, sink, nextStack);
    }
  }

  return sink;
};

export const detectCycles = (graph: PlanGraph): boolean => {
  const path = new Set<string>();
  const stack = new Set<string>();

  const dfs = (node: PlanNode): boolean => {
    if (stack.has(node)) {
      return true;
    }
    if (path.has(node)) {
      return false;
    }

    path.add(node);
    stack.add(node);

    for (const next of collectEdgesFrom(graph, node)) {
      if (dfs(next)) {
        return true;
      }
    }

    stack.delete(node);
    return false;
  };

  return graph.nodes.some((node) => dfs(node));
};

export const flattenPlanGraph = (graph: PlanGraph): readonly ConvergencePlan[] => {
  const nodes = new Map<string, ConvergencePlan>();
  const fallbackWorkspaceId = 'workspace:convergence' as ConvergenceWorkspaceId;
  for (const node of graph.nodes) {
    nodes.set(node, {
      id: node as ConvergencePlanId,
      workspaceId: fallbackWorkspaceId,
      title: `plan:${node}`,
      score: 1,
      steps: [],
      constraints: new Map(),
      createdAt: new Date().toISOString(),
      metadata: {},
    });
  }

  const order: ConvergencePlan[] = [];
  const sink: PlanNode[] = [];

  for (const node of graph.nodes) {
    visit(graph, node, sink, []);
  }

  for (const nodeId of sink) {
    const plan = nodes.get(nodeId);
    if (plan) {
      order.push(plan);
    }
  }

  return order;
};

export const countPaths = (graph: PlanGraph): Readonly<Record<PlanNode, number>> => {
  const cache = new Map<PlanNode, number>();
  const counts = new Map<PlanNode, number>();
  const nextsByNode = new Map<PlanNode, readonly PlanNode[]>();

  for (const node of graph.nodes) {
    nextsByNode.set(node, collectEdgesFrom(graph, node));
  }

  const visitCount = (node: PlanNode): number => {
    if (cache.has(node)) {
      return cache.get(node) as number;
    }

    const nexts = nextsByNode.get(node) ?? [];
    const total = nexts.length === 0 ? 1 : nexts.reduce((acc, next) => acc + visitCount(next), 0);
    cache.set(node, total);
    return total;
  };

  for (const node of graph.nodes) {
    counts.set(node, visitCount(node));
  }

  return Object.fromEntries(counts) as Readonly<Record<PlanNode, number>>;
};

export const summarizeGraph = (graph: PlanGraph): PlanGraphSnapshot => {
  const seen = new Set<PlanNode>(graph.nodes);
  const pathCount = Iterator.from(graph.nodes.values())
    .map((node) => countPaths(graph)[node] ?? 0)
    .reduce((acc, entry) => acc + entry, 0);
  const events: ConvergenceRunEvent[] = [];

  for (const node of graph.nodes) {
    const children = collectEdgesFrom(graph, node);
    visited.clear();

    const base = children.map((child) => `${node}->${child}`);
    for (const target of base) {
      events.push({
        type: 'command',
        at: new Date().toISOString(),
        runId: `${node}:${target}` as ConvergenceRunId,
        payload: {
          node,
          target,
        },
      });
    }
  }

  return {
    nodes: [...graph.nodes],
    edges: [...graph.edges],
    pathCount,
    eventLog: events,
  };
};

export const withStableGraph = (plans: readonly ConvergencePlan[]): PlanGraph => {
  const nodes = plans.map((plan) => plan.id);
  const edges = plans
    .flatMap((plan) => {
      if (plan.steps.length === 0) {
        return [] as readonly PlanEdge[];
      }

      return plan.steps.slice(0, Math.max(1, plan.steps.length - 1)).map((step, index) => {
        const from = plan.id;
        const to = ((plan.steps[index + 1]?.id as unknown) ?? plan.id) as ConvergencePlanId;
        if (String(from) === String(to)) {
          return [] as readonly PlanEdge[];
        }
        return [[from, to] as const];
      }).flat();
    })
    .filter((entry): entry is PlanEdge => entry.length === 2);

  return {
    nodes,
    edges,
  };
};
