import { RecoveryPlan, RecoveryAction, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import {
  PlanExecutionGraph,
  buildExecutionGraph,
  rankGraphBottlenecks,
  findCriticalPath,
  measureExecutionMetrics,
} from '@domain/recovery-cockpit-models';

export type DependencyHealth = 'healthy' | 'fragile' | 'brittle';

export type DependencyWindow = {
  readonly at: UtcIsoTimestamp;
  readonly actionCount: number;
  readonly dependencyDepth: number;
  readonly risk: number;
};

export type DependencyInsight = {
  readonly planId: RecoveryPlan['planId'];
  readonly health: DependencyHealth;
  readonly createdAt: UtcIsoTimestamp;
  readonly graph: PlanExecutionGraph;
  readonly criticalPath: ReadonlyArray<RecoveryAction['id']>;
  readonly windows: ReadonlyArray<DependencyWindow>;
  readonly recommendation: string;
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

const windowAt = (index: number): UtcIsoTimestamp => new Date(Date.now() + index * 3 * 60 * 1000).toISOString() as UtcIsoTimestamp;

const dependencyDepth = (graph: PlanExecutionGraph, actionId: RecoveryAction['id']): number =>
  graph.adjacency.get(actionId)?.length ?? 0;

const evaluateHealth = (graph: PlanExecutionGraph, windows: readonly DependencyWindow[]): DependencyHealth => {
  const avgRisk = windows.reduce((acc, window) => acc + window.risk, 0) / Math.max(1, windows.length);
  const hasMultiBranch = graph.layerCount > 3;
  const hasBottlenecks = graph.edges.length >= windows.length;
  if (avgRisk > 70 || (hasBottlenecks && hasMultiBranch)) return 'brittle';
  if (avgRisk > 40 || hasMultiBranch) return 'fragile';
  return 'healthy';
};

const metricWindows = (graph: PlanExecutionGraph): DependencyWindow[] =>
  graph.nodeOrder.map((node, index) => ({
    at: windowAt(index),
    actionCount: graph.nodeOrder.length,
    dependencyDepth: dependencyDepth(graph, node),
    risk: clamp((index + 1) * 7 + dependencyDepth(graph, node) * 12),
  }));

export const buildDependencyInsight = (plan: RecoveryPlan): DependencyInsight => {
  const graph = buildExecutionGraph(plan);
  const windows = metricWindows(graph);
  const metrics = measureExecutionMetrics(plan);
  const criticalPath = findCriticalPath(plan);
  const recommendation =
    metrics.longestPath >= 2
    ? `Execute ${criticalPath.length} steps on priority path first`
    : 'Reduce dependency fanout before execution';
  return {
    planId: plan.planId,
    health: evaluateHealth(graph, windows),
    createdAt: new Date().toISOString() as UtcIsoTimestamp,
    graph,
    criticalPath,
    windows,
    recommendation: `${recommendation} | maxLayer=${metrics.longestPath} bottlenecks=${metrics.bottlenecks.length}`,
  };
};

export const summarizeDependencyRisk = (insight: DependencyInsight): string =>
  `${insight.planId} health=${insight.health} bottlenecks=${insight.graph.edges.length} path=${insight.criticalPath.length}`;

export const compareDependencies = (left: DependencyInsight, right: DependencyInsight): number => {
  const weights = { healthy: 0, fragile: 1, brittle: 2 } as const;
  const healthDelta = weights[left.health] - weights[right.health];
  if (healthDelta !== 0) {
    return healthDelta;
  }
  return left.criticalPath.length - right.criticalPath.length;
};

export const sortDependencyInsights = (
  insights: readonly DependencyInsight[],
): ReadonlyArray<DependencyInsight> =>
  [...insights].sort((left, right) => compareDependencies(left, right));

export const buildDependencyHeatmap = (plan: RecoveryPlan): ReadonlyArray<{
  actionId: RecoveryAction['id'];
  score: number;
  tags: ReadonlyArray<string>;
}> => {
  const actions = [...plan.actions];
  const graph = buildExecutionGraph(plan);
  return actions
    .map((action) => {
      const fanIn = graph.reverseAdjacency.get(action.id)?.length ?? 0;
      const fanOut = graph.adjacency.get(action.id)?.length ?? 0;
      const score = clamp(100 - fanIn * 18 + fanOut * 11 + (action.expectedDurationMinutes / 2));
      return {
        actionId: action.id,
        score,
        tags: action.tags,
      };
    })
    .sort((left, right) => right.score - left.score);
};
