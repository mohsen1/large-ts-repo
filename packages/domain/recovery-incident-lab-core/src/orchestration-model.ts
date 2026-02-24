import type { IncidentLabScenario, IncidentLabPlan, StepId, IncidentLabRun, LabTemplateStep } from './types';
import { createPlanId } from './types';
import { draftPlan } from './planner';
import { createClock } from './types';

export interface OrchestrationTemplate {
  readonly id: string;
  readonly scenarioId: string;
  readonly title: string;
  readonly ordered: readonly StepId[];
  readonly checksum: string;
}

export interface OrchestrationState {
  readonly template: OrchestrationTemplate;
  readonly plan: IncidentLabPlan;
  readonly createdAt: string;
  readonly revision: number;
}

export interface OrchestrationDelta {
  readonly added: readonly StepId[];
  readonly removed: readonly StepId[];
  readonly replaced: readonly StepId[];
  readonly message: string;
}

export interface OrchestratedRun {
  readonly run: IncidentLabRun;
  readonly stepAttempts: Readonly<Record<StepId, number>>;
  readonly stage: 'created' | 'prepared' | 'executing' | 'verified';
}

export const buildTemplateFromScenario = (scenario: IncidentLabScenario): OrchestrationTemplate => {
  const draft = draftPlan({ scenario, orderedBy: 'topology', requestedBy: 'template-builder' });
  const checksum = draft.plan.selected.reduce((acc, step) => `${acc}|${step}`, '');
  return {
    id: `tpl-${scenario.id}`,
    scenarioId: scenario.id,
    title: `Template-${scenario.name}`,
    ordered: draft.plan.selected,
    checksum,
  };
};

export const buildState = (scenario: IncidentLabScenario): OrchestrationState => {
  const plan = draftPlan({ scenario, orderedBy: 'topology', requestedBy: scenario.owner }).plan;
  const template = buildTemplateFromScenario(scenario);
  return {
    template,
    plan,
    createdAt: createClock().now(),
    revision: 1,
  };
};

export const diffTemplates = (left: OrchestrationTemplate, right: OrchestrationTemplate): OrchestrationDelta => {
  const added = right.ordered.filter((step) => !left.ordered.includes(step));
  const removed = left.ordered.filter((step) => !right.ordered.includes(step));
  const replaced = added.length > 0 || removed.length > 0 ? added.filter((step) => right.ordered.includes(step)) : [];
  const message = [
    `added=${added.length}`,
    `removed=${removed.length}`,
    `replaced=${replaced.length}`,
  ].join(' ');
  return { added, removed, replaced, message };
};

export const computeAttemptPlan = (plan: IncidentLabPlan, multiplier = 1): Readonly<Record<StepId, number>> => {
  const attempts: Record<StepId, number> = {};
  for (const stepId of plan.queue) {
    const base = stepId.length % 3;
    attempts[stepId] = Math.max(1, base * multiplier);
  }
  return attempts;
};

export const createOrchestratedRun = (plan: IncidentLabPlan, status: OrchestratedRun['stage'] = 'created'): OrchestratedRun => {
  const run: IncidentLabRun = {
    runId: createPlanId(plan.scenarioId).replace('plan', 'run') as IncidentLabRun['runId'],
    planId: plan.id,
    scenarioId: plan.scenarioId,
    startedAt: createClock().now(),
    state: status === 'verified' ? 'completed' : 'active',
    results: [],
  };
  return {
    run,
    stepAttempts: computeAttemptPlan(plan, status === 'verified' ? 2 : 1),
    stage: status,
  };
};

export const stepDependencies = (steps: readonly LabTemplateStep[]): Map<StepId, readonly StepId[]> => {
  const map = new Map<StepId, readonly StepId[]>();
  for (const step of steps) {
    map.set(step.id, [...step.dependencies]);
  }
  return map;
};

export const flattenByWindow = <T>(items: readonly T[], size: number): readonly T[][] => {
  const windows: T[][] = [];
  for (let index = 0; index < items.length; index += Math.max(1, size)) {
    windows.push(items.slice(index, index + Math.max(1, size)));
  }
  return windows;
};

export const pickWindow = <T>(windows: readonly (readonly T[])[], window = 0): readonly T[] =>
  windows[window] ?? [];

export const summarizeOrchestratedRun = (orchestratedRun: OrchestratedRun): string => {
  const attemptCount = Object.values(orchestratedRun.stepAttempts).reduce((acc, count) => acc + count, 0);
  return `${orchestratedRun.run.runId} ${orchestratedRun.stage} attempts=${attemptCount} steps=${orchestratedRun.run.results.length}`;
};
