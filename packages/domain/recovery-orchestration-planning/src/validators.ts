import type { StrategyTemplate, StrategyPlan, StrategyRun, StrategyDependency, StrategyStepNode, StrategyPolicy } from './types';

export const validatePolicy = (policy: StrategyPolicy): boolean => {
  if (policy.maxParallelism < 1) {
    return false;
  }
  if (policy.minimumRunbookTokens < 0) {
    return false;
  }
  if (policy.commandCostPenalty < 0) {
    return false;
  }
  return true;
};

export const validateDependencies = (dependencies: readonly StrategyDependency[], nodes: readonly StrategyStepNode[]): boolean => {
  const nodeSet = new Set(nodes.map((node) => node.stepId));
  for (const dependency of dependencies) {
    if (!nodeSet.has(dependency.from)) {
      return false;
    }
    for (const target of dependency.to) {
      if (!nodeSet.has(target)) {
        return false;
      }
      if (dependency.from === target) {
        return false;
      }
    }
  }
  return true;
};

export const validateTemplate = (template: StrategyTemplate): boolean => {
  if (template.templateId.length < 1) {
    return false;
  }
  if (template.steps.length === 0) {
    return false;
  }
  if (!validateDependencies(template.dependencies, template.steps)) {
    return false;
  }
  return template.targets.length > 0;
};

export const validateRun = (run: StrategyRun): boolean => {
  if (run.status === 'running' && run.score < 0) {
    return false;
  }
  return run.runId.length > 0 && run.tenantId.length > 0;
};

export const collectCycleHints = (plan: StrategyPlan, edges: readonly StrategyDependency[]): readonly string[] => {
  const planNodes = new Set(plan.executionPriority);
  const occurrences = new Map<string, number>();

  for (const node of plan.executionPriority) {
    occurrences.set(node, (occurrences.get(node) ?? 0) + 1);
  }

  const duplicate = [...occurrences.entries()].filter(([, count]) => count > 1).map(([node]) => `duplicate:${node}`);
  const missingEdge = edges
    .flatMap((edge) => edge.to.filter((target) => !planNodes.has(target)).map((target) => `missing:${target}`));
  return [...duplicate, ...missingEdge];
};

export const validatePlan = (plan: StrategyPlan): boolean => {
  if (plan.runbookTokens.length === 0) {
    return false;
  }
  if (plan.executionPriority.length < plan.runbookTokens.length) {
    return false;
  }
  return plan.windows.length > 0;
};
