import type { RecoveryPlaybookModel, OrchestrationPlan, PlanningWindow, ScenarioNode, ScenarioId } from './types';

export const buildExecutionOrder = (model: RecoveryPlaybookModel): readonly ScenarioId[] => {
  const visited = new Set<string>();
  const ordered: ScenarioId[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    const node = model.scenarioGraph.nodes[id] as ScenarioNode | undefined;
    if (!node) {
      return;
    }
    for (const dep of node.dependencies) {
      visit(dep);
    }
    visited.add(id);
    ordered.push(id);
  };

  for (const id of model.scenarioGraph.order) {
    visit(id);
  }

  for (const candidate of Object.keys(model.scenarioGraph.nodes)) {
    visit(candidate);
  }

  return ordered;
};

export const estimateWindow = (
  nodes: Record<string, ScenarioNode>,
  ordered: readonly ScenarioId[],
): PlanningWindow => {
  const durationMinutes = ordered.reduce((sum, nodeId) => {
    const current = nodes[nodeId];
    return sum + (current?.expectedDurationMinutes ?? 0);
  }, 0);

  const start = new Date().toISOString();
  const endDate = new Date(Date.now() + durationMinutes * 60000).toISOString();

  return {
    start,
    end: endDate,
    mode: 'canary',
  };
};

export const createPlan = (model: RecoveryPlaybookModel, window?: Partial<PlanningWindow>): OrchestrationPlan => {
  const ordered = buildExecutionOrder(model);
  const autoWindow = estimateWindow(model.scenarioGraph.nodes, ordered);

  return {
    id: `plan-${model.id}-${Date.now()}`,
    playbookId: model.id,
    window: {
      ...autoWindow,
      ...window,
    },
    trace: ordered.map((scenarioId) => ({
      step: scenarioId,
      startedAt: new Date().toISOString(),
      startedBy: 'orchestrator',
      outcome: 'blocked',
      metrics: [],
    })),
    version: 1,
  };
};

export const projectWindowCoverage = (plan: OrchestrationPlan, nowIso: string): number => {
  const start = Date.parse(plan.window.start);
  const end = Date.parse(plan.window.end);
  const now = Date.parse(nowIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 0;
  }
  const normalized = (now - start) / (end - start);
  if (normalized < 0) {
    return 0;
  }
  if (normalized > 1) {
    return 1;
  }
  return normalized;
};
