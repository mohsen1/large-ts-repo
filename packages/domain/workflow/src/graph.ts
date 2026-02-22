import { Brand } from '@shared/core';

export type WorkflowId = Brand<string, 'WorkflowId'>;
export type StepId = Brand<string, 'StepId'>;

export type StepStatus = 'created' | 'running' | 'done' | 'failed' | 'skipped';

export interface StepNode {
  id: StepId;
  name: string;
  dependsOn: StepId[];
  retries: number;
  timeoutMs: number;
}

export interface WorkflowDef {
  id: WorkflowId;
  name: string;
  steps: StepNode[];
}

export interface WorkflowState {
  step: StepId;
  status: StepStatus;
  at: string;
  error?: string;
}

export const canProgress = (state: StepStatus, graph: WorkflowDef, current: StepId): StepId[] => {
  const next = graph.steps.filter((step) => {
    if (state !== 'done') return false;
    return step.dependsOn.includes(current);
  });
  return next.map((step) => step.id);
};

export const topological = (graph: WorkflowDef): StepId[] => {
  const visited = new Set<StepId>();
  const stack = new Set<StepId>();
  const order: StepId[] = [];

  const visit = (id: StepId) => {
    if (visited.has(id) || stack.has(id)) return;
    const step = graph.steps.find((item) => item.id === id);
    if (!step) return;
    stack.add(id);
    for (const dep of step.dependsOn) {
      visit(dep as StepId);
    }
    stack.delete(id);
    visited.add(id);
    order.push(id);
  };

  for (const step of graph.steps) visit(step.id);
  return order;
};

export const criticalPath = (graph: WorkflowDef): number => {
  const times = new Map<StepId, number>();
  const sorted = topological(graph);
  for (const id of sorted) {
    const step = graph.steps.find((item) => item.id === id)!;
    const maxParent = step.dependsOn.length === 0 ? 0 : Math.max(...step.dependsOn.map((p) => times.get(p) ?? 0));
    times.set(id, maxParent + step.timeoutMs);
  }
  return sorted.reduce((max, id) => Math.max(max, times.get(id) ?? 0), 0);
};
