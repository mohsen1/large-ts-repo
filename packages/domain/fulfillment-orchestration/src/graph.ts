import { Result } from '@shared/result';
import { FulfillmentPlan, FulfillmentStep, StepState, isTerminalState } from './types';

export interface StepGraph<TContext> {
  lookup: Map<string, FulfillmentStep<TContext>>;
  edges: Map<string, ReadonlyArray<string>>;
  indegree: Map<string, number>;
}

export const buildGraph = <TContext>(plan: FulfillmentPlan<TContext>): StepGraph<TContext> => {
  const lookup = new Map<string, FulfillmentStep<TContext>>();
  const edges = new Map<string, ReadonlyArray<string>>();
  const indegree = new Map<string, number>();

  for (const step of plan.steps) {
    lookup.set(step.id, step);
    edges.set(step.id, []);
    indegree.set(step.id, 0);
  }

  for (const step of plan.steps) {
    for (const parent of step.dependsOn) {
      const parentStep = lookup.get(parent);
      if (!parentStep) continue;
      edges.set(parent, [...(edges.get(parent) ?? []), step.id]);
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
    }
  }

  return { lookup, edges, indegree };
};

export const topologicalOrder = <TContext>(plan: FulfillmentPlan<TContext>): Result<readonly string[]> => {
  const { lookup, edges, indegree } = buildGraph(plan);
  const queue = Array.from(indegree.entries()).filter(([, inFlight]) => inFlight === 0).map(([id]) => id);
  const order: string[] = [];

  while (queue.length > 0) {
    const stepId = queue.shift();
    if (!stepId) break;
    order.push(stepId);
    const next = edges.get(stepId) ?? [];
    for (const nextId of next) {
      const nextIn = (indegree.get(nextId) ?? 0) - 1;
      if (nextIn <= 0) {
        indegree.set(nextId, 0);
        queue.push(nextId);
      } else {
        indegree.set(nextId, nextIn);
      }
    }
  }

  if (order.length !== lookup.size) {
    return { ok: false, error: new Error('graph cycle or invalid dependencies') } as const;
  }

  return { ok: true, value: order as readonly string[] };
};

export const canAdvance = (step: FulfillmentStep, now: StepState): boolean => {
  if (step.state === 'failed') return false;
  const transitions: Record<StepState, readonly StepState[]> = {
    queued: ['eligible'],
    eligible: ['allocated'],
    allocated: ['picked'],
    picked: ['packed'],
    packed: ['dispatched'],
    dispatched: ['delivered'],
    delivered: ['closed'],
    closed: [],
    failed: [],
  };

  return transitions[step.state].includes(now);
};

export const isPlanComplete = <TContext>(plan: FulfillmentPlan<TContext>): boolean => {
  return plan.steps.every((step) => isTerminalState(step.state));
};
