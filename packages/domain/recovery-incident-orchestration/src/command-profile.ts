import type {
  IncidentPlan,
  WorkItemId,
  RecoveryRoute,
  RecoveryRouteNode,
  IncidentId,
  OrchestrationRun,
} from './types';
import { topologicalOrder } from './planner';

export interface CommandBudget {
  readonly owner: string;
  readonly commandLimit: number;
  readonly budgetUsed: number;
  readonly utilization: number;
}

export interface CommandPressureReport {
  readonly incidentId: IncidentId;
  readonly commandCount: number;
  readonly commandKinds: Readonly<Record<string, number>>;
  readonly criticalPathMinutes: number;
  readonly ownerBudgets: readonly CommandBudget[];
  readonly uniqueOwners: number;
  readonly duplicatedCommands: readonly WorkItemId[];
  readonly complexity: 'low' | 'medium' | 'high';
  readonly approvalsRequired: boolean;
  readonly canParallelize: boolean;
}

const estimateTimeoutMinutes = (command: RecoveryRouteNode): number => {
  return Math.max(1, command.play.timeoutMinutes);
};

const buildOwnerMap = (nodes: readonly RecoveryRouteNode[]): Record<string, WorkItemId[]> => {
  const buckets: Record<string, WorkItemId[]> = {};
  for (const node of nodes) {
    const owner = String(node.play.parameters.owner ?? 'unknown');
    const bucket = buckets[owner] ?? [];
    bucket.push(node.id);
    buckets[owner] = bucket;
  }
  return buckets;
};

const buildCommandKinds = (nodes: readonly RecoveryRouteNode[]): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    counts[node.play.command] = (counts[node.play.command] ?? 0) + 1;
  }
  return counts;
};

const findDuplicateCommands = (nodes: readonly RecoveryRouteNode[]): readonly WorkItemId[] => {
  const seen = new Set<string>();
  const duplicates = new Set<WorkItemId>();

  for (const node of nodes) {
    const signature = `${node.play.command}#${node.dependsOn.length}`;
    if (seen.has(signature)) {
      duplicates.add(node.id);
    } else {
      seen.add(signature);
    }
  }

  return [...duplicates];
};

const normalize = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }
  const normalized = value / max;
  return Number(Math.min(1, Math.max(0, normalized)).toFixed(4));
};

const buildCriticalPathMinutes = (route: RecoveryRoute): number => {
  const order = topologicalOrder(route);
  const map = new Map<WorkItemId, number>();

  for (const node of order) {
    const routeNode = route.nodes.find((candidate) => candidate.id === node);
    if (!routeNode) {
      continue;
    }

    const parentDepth = routeNode.dependsOn
      .map((parent) => map.get(parent) ?? 0)
      .reduce((max, depth) => Math.max(max, depth), 0);
    map.set(node, parentDepth + Math.max(1, Math.ceil(routeNode.play.timeoutMinutes / 10)));
  }

  const longest = [...map.values()].reduce((max, value) => Math.max(max, value), 0);
  return Math.max(1, longest);
};

export const buildCommandProfile = (plan: IncidentPlan): CommandPressureReport => {
  const commandNodes = plan.route.nodes;
  const commandKinds = buildCommandKinds(commandNodes);
  const ownerBuckets = buildOwnerMap(commandNodes);
  const sortedOwnerKeys = Object.keys(ownerBuckets).sort();
  const totalCommands = commandNodes.length;

  const ownerBudgets = sortedOwnerKeys.map((owner) => {
    const ids = ownerBuckets[owner] ?? [];
    const timeoutAggregate = ids.reduce((acc, id) => {
      const node = commandNodes.find((candidate) => candidate.id === id);
      return acc + (node ? estimateTimeoutMinutes(node) : 0);
    }, 0);
    const commandLimit = Math.max(1, ids.length);
    const budgetUsed = timeoutAggregate > 0
      ? Math.min(timeoutAggregate, commandLimit)
      : ids.length;

    return {
      owner,
      commandLimit,
      budgetUsed,
      utilization: normalize(budgetUsed, commandLimit),
    };
  });

  const criticalPathMinutes = buildCriticalPathMinutes(plan.route);
  const duplicatedCommands = findDuplicateCommands(commandNodes);
  const uniqueOwners = ownerBuckets.length === undefined ? Object.keys(ownerBuckets).length : Object.keys(ownerBuckets).length;
  const approvalsRequired = criticalPathMinutes > 120 || duplicatedCommands.length > 1;
  const totalCommandKindCount = Object.keys(commandKinds).length;
  const canParallelize = totalCommandKindCount >= 3 && criticalPathMinutes < 90;

  const complexity = totalCommands > 8 || criticalPathMinutes > 180
    ? 'high'
    : totalCommands > 4 || criticalPathMinutes > 90
      ? 'medium'
      : 'low';

  return {
    incidentId: plan.incidentId,
    commandCount: commandNodes.length,
    commandKinds,
    criticalPathMinutes,
    ownerBudgets,
    uniqueOwners,
    duplicatedCommands,
    complexity,
    approvalsRequired,
    canParallelize,
  };
};

export const summarizeBudget = (report: CommandPressureReport): number => {
  const ownerWeight = report.ownerBudgets.reduce((acc, budget) => acc + budget.utilization, 0);
  const commandComplexity = Object.values(report.commandKinds).reduce((acc, count) => acc + count, 0);
  const duplicatePenalty = report.duplicatedCommands.length * 0.05;
  return Number((ownerWeight + commandComplexity * 0.07 + duplicatePenalty).toFixed(4));
};

export const buildRuntimeHealthForRuns = (runs: readonly OrchestrationRun[]): {
  readonly completed: number;
  readonly active: number;
  readonly blocked: number;
  readonly failed: number;
  readonly ratio: number;
} => {
  const completed = runs.filter((run) => run.state === 'done').length;
  const active = runs.filter((run) => run.state === 'running').length;
  const failed = runs.filter((run) => run.state === 'failed').length;
  const blocked = runs.filter((run) => run.state === 'pending').length;
  const total = runs.length;

  return {
    completed,
    active,
    blocked,
    failed,
    ratio: Number((total === 0 ? 0 : (completed / total).toFixed(4))),
  };
};
