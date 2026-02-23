import type { LabDependency, LabPlan, OrchestrationLab, OrchestrationLabEnvelope } from './types';

const normalizeDependencies = (dependencies: readonly LabDependency[]) =>
  [...dependencies].map((dependency) => ({
    from: dependency.from,
    to: dependency.to,
    reason: dependency.reason,
  }));

const topologicalSortSteps = (plan: LabPlan): readonly LabPlan['steps'][number][] => {
  const byId = new Map<string, LabPlan['steps'][number]>();
  for (const step of plan.steps) {
    byId.set(step.id, step);
  }

  const indegree = new Map<string, number>();
  for (const step of plan.steps) {
    indegree.set(step.id, step.dependencies.length);
  }

  const queue = [...indegree.entries()]
    .filter((entry) => entry[1] === 0)
    .map((entry) => entry[0]);

  const output: LabPlan['steps'][number][] = [];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    const current = byId.get(next);
    if (!current) {
      continue;
    }

    output.push(current);
    const dependents = [...byId.values()].filter((candidate) =>
      candidate.dependencies.some((dependency) => dependency.from === current.id),
    );

    for (const dependent of dependents) {
      const remaining = (indegree.get(dependent.id) ?? 0) - 1;
      indegree.set(dependent.id, remaining);
      if (remaining === 0) {
        queue.push(dependent.id);
      }
    }
  }

  if (output.length === plan.steps.length) {
    return output;
  }

  return [...plan.steps];
};

const scoreOrderedPlan = (steps: readonly LabPlan['steps'][number][]): number =>
  steps.reduce((acc, step, index) => {
    const positionPenalty = Math.abs(steps.length - index);
    const riskPenalty = step.risk * 0.9;
    return acc + Math.max(0, positionPenalty - riskPenalty);
  }, 0);

export const materializePlan = (plan: LabPlan): LabPlan => {
  const sorted = topologicalSortSteps(plan);
  const normalized = sorted.map((step, index) => ({
    ...step,
    dependencies: normalizeDependencies(step.dependencies),
    name: `${index + 1}. ${step.name}`,
  }));

  return {
    ...plan,
    steps: normalized,
    score: Number(scoreOrderedPlan(normalized).toFixed(2)),
  };
};

export const buildFabricWorkspace = (labs: readonly OrchestrationLab[]): OrchestrationLab[] =>
  labs.map((lab) => ({
    ...lab,
    plans: lab.plans.map(materializePlan),
    windows: [...lab.windows].sort((left, right) => left.from.localeCompare(right.from)),
  }));

export const pickPlanByPolicy = (
  envelope: OrchestrationLabEnvelope,
  compare: (left: LabPlan, right: LabPlan) => number,
): LabPlan | undefined =>
  envelope.plans
    .slice()
    .sort(compare)
    .find((plan) => plan.state !== 'retired') ?? envelope.plans[0];

export const pickFirstPlan = (envelope: OrchestrationLabEnvelope): LabPlan | undefined =>
  pickPlanByPolicy(envelope, (left, right) => right.score - left.score);
