import type { IncidentRecord, IncidentPlan, WorkItemId, RecoveryRouteNode, OrchestrationRun } from './types';
import { topologicalOrder, routeExecutionBatches, splitByOwner } from './planner';
import { validateRun } from './validators';

export interface RouteNodeLoad {
  readonly routeId: IncidentPlan['id'];
  readonly owner: string;
  readonly nodeCount: number;
  readonly weightedLoad: number;
}

export interface RouteForecast {
  readonly routeId: IncidentPlan['id'];
  readonly planTitle: string;
  readonly criticalPath: number;
  readonly concurrencyWindow: number;
  readonly nodeLoad: readonly RouteNodeLoad[];
  readonly ownerDistribution: Readonly<Record<string, number>>;
  readonly predictedBuckets: readonly {
    readonly nodeId: WorkItemId;
    readonly owner: string;
    readonly estStartMinute: number;
    readonly estDurationMinute: number;
  }[];
  readonly healthy: boolean;
}

export interface RouteTimelineEvent {
  readonly atMinute: number;
  readonly completed: number;
  readonly running: number;
  readonly queued: number;
}

const computeOwner = (node: RecoveryRouteNode): string =>
  String(node.play.parameters.owner ?? 'unassigned');

const buildBuckets = (nodes: readonly RecoveryRouteNode[], windowMinutes: number): number[] => {
  return nodes.map((node, index) => Math.floor(index / windowMinutes));
};

export const summarizeOwners = (plan: IncidentPlan): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const node of plan.route.nodes) {
    const owner = computeOwner(node);
    counts[owner] = (counts[owner] ?? 0) + 1;
  }
  return counts;
};

export const loadProfile = (plan: IncidentPlan): readonly RouteNodeLoad[] => {
  const grouped = splitByOwner(plan.route);
  const entries: RouteNodeLoad[] = [];

  for (const [owner, nodes] of grouped.entries()) {
    const weightedLoad = nodes.reduce((sum, nodeId, index) => {
      const node = plan.route.nodes.find((candidate) => candidate.id === nodeId);
      return sum + (node ? node.play.timeoutMinutes * (1 + index / 10) : 0);
    }, 0);

    entries.push({
      routeId: plan.id,
      owner,
      nodeCount: nodes.length,
      weightedLoad: Number(weightedLoad.toFixed(4)),
    });
  }

  return entries;
};

const buildTimeline = (plan: IncidentPlan, batchMinutes: number): readonly RouteTimelineEvent[] => {
  const order = topologicalOrder(plan.route);
  const buckets = buildBuckets(plan.route.nodes, batchMinutes);
  const minutes = Math.max(1, buckets[buckets.length - 1] ?? 0) + 1;
  const timeline: RouteTimelineEvent[] = [];

  for (let minute = 0; minute <= minutes; minute += 1) {
    const running = order.filter((_node, index) => Math.floor(index / batchMinutes) === minute).length;
    const completed = Math.max(0, Math.min(order.length, minute * batchMinutes));
    timeline.push({
      atMinute: minute,
      completed,
      running,
      queued: Math.max(0, order.length - completed - running),
    });
  }

  return timeline;
};

export const forecastRoute = (plan: IncidentPlan): RouteForecast => {
  const ownerDistribution = summarizeOwners(plan);
  const nodeLoad = loadProfile(plan);
  const windows = routeExecutionBatches(plan.route, 3);
  const predictedBuckets = plan.route.nodes.map((node, index) => {
    const owner = computeOwner(node);
    return {
      nodeId: node.id,
      owner,
      estStartMinute: index * 2,
      estDurationMinute: node.play.timeoutMinutes,
    };
  });
  const healthy = nodeLoad.every((entry) => entry.weightedLoad < 1200);

  return {
    routeId: plan.id,
    planTitle: plan.title,
    criticalPath: windows.length,
    concurrencyWindow: Math.max(1, windows.length),
    nodeLoad,
    ownerDistribution,
    predictedBuckets,
    healthy,
  };
};

export const routeHealth = (plan: IncidentPlan): {
  readonly healthy: boolean;
  readonly timeline: readonly RouteTimelineEvent[];
  readonly warnings: readonly string[];
} => {
  const forecast = forecastRoute(plan);
  const timeline = buildTimeline(plan, 3);
  const warnings = [...forecast.nodeLoad].flatMap((entry) => {
    if (entry.weightedLoad > 800) {
      return [`owner ${entry.owner} workload ${entry.weightedLoad}`];
    }
    return [];
  });

  return {
    healthy: warnings.length === 0 && forecast.healthy,
    timeline,
    warnings,
  };
};

export const reconcileRunOutputs = (
  runs: readonly OrchestrationRun[],
): {
  readonly failedCount: number;
  readonly doneCount: number;
  readonly validCount: number;
} => {
  let failedCount = 0;
  let doneCount = 0;
  let validCount = 0;

  for (const run of runs) {
    const validation = validateRun(run);
    if (validation.valid) {
      validCount += 1;
    }
    if (run.state === 'failed') {
      failedCount += 1;
    }
    if (run.state === 'done') {
      doneCount += 1;
    }
  }

  return { failedCount, doneCount, validCount };
};

export const planImpactByRecord = (plan: IncidentPlan, incident: IncidentRecord): number => {
  const base = incident.signals.length;
  const planSignals = plan.windows.length;
  const impact = Math.max(0, planSignals - base);
  return Math.min(100, impact * 5);
};
