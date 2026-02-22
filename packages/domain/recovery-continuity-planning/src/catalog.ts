import { normalizePriorityWeight, partitionByPriority, sortByDependencyDepth } from './utility';
import type { ContinuityPlanTemplate, ContinuityPlanId, ContinuityPriority, ContinuityTaskTemplate } from './types';

export interface PlanCatalogIndex {
  readonly planId: ContinuityPlanId;
  readonly priority: ContinuityPriority;
  readonly dependencyCount: number;
  readonly regionCount: number;
  readonly taskCount: number;
}

export interface CatalogFilter {
  readonly tenantId?: ContinuityPlanTemplate['tenantId'];
  readonly priorities?: readonly ContinuityPriority[];
  readonly regions?: readonly string[];
  readonly enabledOnly?: boolean;
}

export const buildPlanIndex = (plan: ContinuityPlanTemplate): PlanCatalogIndex => ({
  planId: plan.id,
  priority: plan.priority,
  dependencyCount: plan.expectedDependencies.length,
  regionCount: new Set(plan.tasks.map((task) => task.region)).size,
  taskCount: plan.tasks.length,
});

export const byTenantPlans = (
  plans: readonly ContinuityPlanTemplate[],
  tenantId: ContinuityPlanTemplate['tenantId'],
): readonly ContinuityPlanTemplate[] => {
  return plans.filter((plan) => plan.tenantId === tenantId);
};

export const prioritizePlans = (
  plans: readonly ContinuityPlanTemplate[],
): readonly (ContinuityPlanTemplate & { score: number })[] => {
  return plans
    .map((plan) => ({
      ...plan,
      score: normalizePriorityWeight(plan.priorityWeight) * 0.6 + Math.min(plan.tasks.length / 30, 1) * 0.4,
    }))
    .sort((left, right) => {
      if (right.score === left.score) return right.createdAt.localeCompare(left.createdAt);
      return right.score - left.score;
    });
};

export const plansByPriorityBuckets = (
  plans: readonly ContinuityPlanTemplate[],
): Readonly<Record<string, readonly (ContinuityPlanTemplate & { score: number })[]>> =>
  partitionByPriority(prioritizePlans(plans), (plan) => plan.priority);

const hasCyclicDependency = (
  planTasks: readonly ContinuityTaskTemplate[],
  start: string,
  target: string,
  visited: Set<string> = new Set<string>(),
): boolean => {
  if (start === target) return true;
  if (visited.has(start)) return false;

  visited.add(start);

  for (const dep of planTasks.filter((task) => task.artifactId === start)) {
    for (const incoming of dep.dependencies) {
      if (hasCyclicDependency(planTasks, incoming.dependsOn, target, visited)) return true;
    }
  }

  return false;
};

export const detectCycles = (plan: ContinuityPlanTemplate): readonly string[] => {
  const broken = new Set<string>();

  for (const task of plan.tasks) {
    for (const dep of task.dependencies) {
      if (hasCyclicDependency(plan.tasks, dep.dependsOn, task.artifactId)) {
        broken.add(`${task.artifactId}->${dep.dependsOn}`);
      }
    }
  }

  return [...broken];
};

export const orderTasks = (plan: ContinuityPlanTemplate): readonly ContinuityTaskTemplate[] => {
  const base = sortByDependencyDepth(plan.tasks);
  return base;
};

export const rankTaskCriticality = (plans: readonly ContinuityPlanTemplate[]): readonly PlanCatalogIndex[] => {
  const indexes = plans.map(buildPlanIndex);
  return indexes.sort((left, right) => {
    if (left.priority === right.priority) {
      if (left.taskCount === right.taskCount) return right.regionCount - left.regionCount;
      return right.taskCount - left.taskCount;
    }
    const weight = {
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
      critical: 5,
    };
    return (weight[right.priority] ?? 0) - (weight[left.priority] ?? 0);
  });
};

export const filterPlans = (
  plans: readonly ContinuityPlanTemplate[],
  filter: CatalogFilter,
): readonly ContinuityPlanTemplate[] => {
  return plans.filter((plan) => {
    if (filter.tenantId && plan.tenantId !== filter.tenantId) return false;
    if (filter.priorities?.length && !filter.priorities.includes(plan.priority)) return false;
    if (filter.regions?.length && !filter.regions.some((region) => plan.region === region)) return false;
    if (filter.enabledOnly && !plan.enabled) return false;
    return true;
  });
};
