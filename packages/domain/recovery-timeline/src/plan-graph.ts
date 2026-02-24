import type { RecoveryTimeline, RecoveryTimelineEvent } from './types';
export interface TimelineFilterFilter {
  timelineId?: string;
  ownerTeam?: string;
  minRiskScore?: number;
  maxRiskScore?: number;
  state?: import('./types').TimelineState;
  query?: string;
  includeSegments?: boolean;
}

export interface TimelinePlanNode {
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly parentIds: readonly string[];
}

export interface TimelinePlanEdge {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

export interface TimelinePlanGraph {
  readonly nodes: Record<string, TimelinePlanNode>;
  readonly edges: readonly TimelinePlanEdge[];
}

export type PlanNodeTuple<T extends readonly TimelinePlanNode[]> = T extends readonly [
  infer H,
  ...infer R
]
  ? H extends TimelinePlanNode
    ? [H['id'], ...PlanNodeTuple<Extract<R, readonly TimelinePlanNode[]>>]
    : []
  : [];

export type NodeRecord<TNodes extends readonly TimelinePlanNode[]> = {
  [N in TNodes[number] as N['id']]: N;
};

export type DependencySet<T extends readonly TimelinePlanNode[]> = {
  [N in T[number] as N['id']]: N['parentIds'];
};

export function buildGraph(timeline: RecoveryTimeline): TimelinePlanGraph {
  const nodes = timeline.events.reduce<Record<string, TimelinePlanNode>>((acc, event) => {
    acc[event.id] = {
      id: event.id,
      title: event.title,
      score: event.riskScore,
      parentIds: event.dependencies,
    };
    return acc;
  }, {});
  const edges = timeline.events.flatMap((event) =>
    event.dependencies.map((dependency) => ({
      from: dependency,
      to: event.id,
      weight: event.riskScore,
    })),
  );
  return { nodes, edges };
}

export function graphRoots(graph: TimelinePlanGraph): string[] {
  const dependent = new Set(graph.edges.map((edge) => edge.to));
  return Object.keys(graph.nodes).filter((id) => !dependent.has(id));
}

export function topologicalOrder(graph: TimelinePlanGraph): string[] {
  const remaining = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const key of Object.keys(graph.nodes)) {
    remaining.set(key, 0);
    adjacency.set(key, []);
  }
  for (const edge of graph.edges) {
    const to = adjacency.get(edge.from);
    if (to) {
      to.push(edge.to);
    }
    remaining.set(edge.to, (remaining.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, indegree] of remaining.entries()) {
    if (indegree === 0) {
      queue.push(id);
    }
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    ordered.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const nextDegree = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }
  return ordered;
}

export function calculateRiskPath(
  graph: TimelinePlanGraph,
  ordered: readonly string[],
): number {
  const scoreById = new Map(ordered.map((id) => [id, graph.nodes[id]?.score ?? 0]));
  return ordered.reduce((max, current) => {
    const currentScore = scoreById.get(current) ?? 0;
    const maxIncoming = graph.edges
      .filter((edge) => edge.to === current)
      .map((edge) => scoreById.get(edge.from) ?? 0)
      .reduce((acc, score) => Math.max(acc, score), 0);
    const resolved = currentScore + maxIncoming;
    scoreById.set(current, resolved);
    return Math.max(max, resolved);
  }, 0);
}

export interface PlanCluster {
  readonly nodeIds: readonly string[];
  readonly totalRisk: number;
  readonly criticalDepth: number;
}

export function summarizeClusters(timeline: RecoveryTimeline): readonly PlanCluster[] {
  const graph = buildGraph(timeline);
  const ordered = topologicalOrder(graph);
  const grouped = ordered.reduce<Record<string, PlanCluster>>((acc, nodeId) => {
    const parentCount = graph.nodes[nodeId]?.parentIds.length ?? 0;
    const label = parentCount > 1 ? 'fan-in' : parentCount === 0 ? 'root' : 'leaf';
    const current = acc[label];
    const currentTotal = current?.totalRisk ?? 0;
    const currentNodes = current?.nodeIds ?? [];
    const risk = graph.nodes[nodeId]?.score ?? 0;
    acc[label] = {
      nodeIds: [...currentNodes, nodeId],
      totalRisk: currentTotal + risk,
      criticalDepth: Math.max(current?.criticalDepth ?? 0, risk + parentCount),
    };
    return acc;
  }, {});
  return Object.values(grouped);
}

export function criticalPath(timeline: RecoveryTimeline): readonly RecoveryTimelineEvent[] {
  const graph = buildGraph(timeline);
  const ordered = topologicalOrder(graph);
  const maxScore = calculateRiskPath(graph, ordered);

  const pathIds = ordered.filter((id, index) => index < ordered.length / 2 || maxScore > 0);
  return timeline.events.filter((event) => pathIds.includes(event.id));
}

export function emitPathReport(timeline: RecoveryTimeline): string {
  const graph = buildGraph(timeline);
  const ordered = topologicalOrder(graph);
  const clusters = summarizeClusters(timeline);
  const top = graphRoots(graph).join(', ');
  const orderedTail = ordered.at(-1) ?? 'none';
  const clusterSummary = clusters
    .map((cluster) => `${cluster.nodeIds.length}:${cluster.totalRisk}`)
    .join('; ');
  return `top=${top}; tail=${orderedTail}; risk=${clusterSummary}`;
}

export function buildPlanFromFilter(
  timeline: RecoveryTimeline,
  filter: TimelineFilterFilter = {},
): string[] {
  const plan = createPlanFromTimelineLike(timeline);
  return plan.filter((id) => {
    if (filter.timelineId && filter.timelineId !== timeline.id) {
      return false;
    }
    return true;
  });

  function createPlanFromTimelineLike(value: RecoveryTimeline): string[] {
    return value.events
      .map((event) => event.id)
      .sort((left, right) => left.localeCompare(right));
  }
}
