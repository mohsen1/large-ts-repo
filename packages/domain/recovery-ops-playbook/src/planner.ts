import type {
  MergeConfig,
  PlaybookBlueprint,
  PlaybookId,
  PlaybookRun,
  PlaybookStepTemplate,
  PlaybookStepId,
  PlaybookExecutionPlan,
  RiskEnvelope,
  SeverityVector,
} from './types';
import { canBlueprintRun } from './constraints';

export interface PlannerOptions {
  playbookId: PlaybookId;
  activeRun: PlaybookRun;
  planConfig: MergeConfig;
}

const compareStepRisk = (step: PlaybookStepTemplate): number => {
  const dependsWeight = step.dependencies.length;
  const actionWeight = step.actions.length;
  const kindWeight = {
    assess: 1,
    notify: 1,
    isolate: 3,
    restore: 4,
    verify: 2,
    postmortem: 1,
  } as const;

  return step.expectedLatencyMinutes * kindWeight[step.kind] + actionWeight + dependsWeight;
};

const pickNext = (
  completed: Set<PlaybookStepId>,
  byId: Map<PlaybookStepId, PlaybookStepTemplate>,
): PlaybookStepId | null => {
  const available = [...byId.keys()].filter((stepId) => {
    const step = byId.get(stepId);
    if (!step) {
      return false;
    }
    return step.dependencies.every((dep) => completed.has(dep));
  });

  let candidate: PlaybookStepTemplate | null = null;
  for (const stepId of available) {
    const step = byId.get(stepId);
    if (!step) {
      continue;
    }

    const readinessScore = compareStepRisk(step);
    if (!candidate || readinessScore < compareStepRisk(candidate)) {
      candidate = step;
    }
  }

  return candidate ? candidate.id : null;
};

const normalizeSeverity = (vector: RiskEnvelope): SeverityVector => {
  const normalized = {
    minor: vector['minor'],
    major: vector['major'],
    catastrophic: vector['catastrophic'],
  };

  const sum = Object.values(normalized).reduce((value, item) => value + item, 0);
  if (sum === 0) {
    return { minor: 0.34, major: 0.33, catastrophic: 0.33 };
  }

  return {
    minor: normalized.minor / sum,
    major: normalized.major / sum,
    catastrophic: normalized.catastrophic / sum,
  };
};

export const buildExecutionPlan = (
  blueprint: PlaybookBlueprint,
  options: PlannerOptions,
): PlaybookExecutionPlan => {
  const checks = canBlueprintRun(blueprint, {
    service: blueprint.service,
    timeBudgetMinutes: 120,
    activeWorkload: 9,
    riskTier: blueprint.tier,
  });

  if (!checks.ok) {
    throw new Error(`Cannot build plan: ${checks.violations.map((item) => item.message).join('; ')}`);
  }

  const byId = new Map<PlaybookStepId, PlaybookStepTemplate>(
    blueprint.steps.map((step) => [step.id, step]),
  );
  const completed = new Set<PlaybookStepId>();
  const order: PlaybookStepId[] = [];

  while (order.length < byId.size) {
    const nextId = pickNext(completed, byId);
    if (!nextId) {
      throw new Error('Cannot resolve plan due to dependency cycle or missing dependency completion');
    }

    const step = byId.get(nextId);
    if (!step) {
      throw new Error(`Missing step definition for ${nextId}`);
    }

    byId.delete(nextId);
    completed.add(nextId);
    order.push(nextId);
  }

  const vector = blueprint.steps.reduce((weights, step, index) => {
    const weightFactor = compareStepRisk(step);
    return {
      ...weights,
      [step.kind]: (weights[step.kind] ?? 0) + weightFactor / (index + 1),
    };
  }, {} as Record<string, number>);

  const riskProfile: SeverityVector = normalizeSeverity({
    ...{
      minor: 18,
      major: 16,
      catastrophic: 6,
      overall: 40,
      tags: ['orchestrated', 'playbook'],
    },
    minor: vector.assess + vector.notify,
    major: vector.restore + vector.verify,
    catastrophic: vector.isolate + vector.postmortem,
  });

  return {
    runbook: options.activeRun,
    order,
    riskProfile,
    merged: {
      preferParallelism: options.planConfig.preferParallelism,
      maxParallelSteps: options.planConfig.maxParallelSteps,
      autoEscalate: options.planConfig.autoEscalate,
      rollbackPolicy: options.planConfig.rollbackPolicy,
    },
  };
};
