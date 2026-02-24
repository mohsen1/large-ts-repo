import type { IncidentLabScenario, LabTemplateStep, StepId, SeverityBand } from './types';

export type ScenarioTag = string & { readonly __brand: unique symbol };
export type ScenarioVersion = string & { readonly __brand: unique symbol };

export interface DSLCommand {
  readonly op: 'add' | 'remove' | 'amend' | 'reorder';
  readonly step?: Partial<LabTemplateStep>;
  readonly stepId?: StepId;
  readonly index?: number;
}

export interface ScenarioMutation {
  readonly scenarioId: string;
  readonly commands: readonly DSLCommand[];
  readonly version: ScenarioVersion;
  readonly author: string;
  readonly createdAt: string;
}

export interface ParsedScenario {
  readonly scenario: IncidentLabScenario;
  readonly tags: readonly ScenarioTag[];
  readonly score: number;
}

export const buildTag = (raw: string): ScenarioTag => `tag:${raw.toLowerCase()}` as ScenarioTag;
export const buildVersion = (scenarioId: string, revision: number): ScenarioVersion =>
  `v:${scenarioId}:${revision}` as ScenarioVersion;

export const tagFromLabels = (labels: readonly string[]): readonly ScenarioTag[] => labels.map(buildTag);

export const estimateComplexity = (scenario: IncidentLabScenario): number =>
  scenario.steps.length * (scenario.topologyTags.length + 1) * Math.max(1, scenario.labels.length);

export const severityWeight = (severity: SeverityBand): number => {
  switch (severity) {
    case 'critical+':
      return 5;
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
};

export const scoreMutation = (mutation: ScenarioMutation, previous: IncidentLabScenario): ParsedScenario => {
  const scenario = applyScenarioMutations(previous, mutation.commands);
  const score = estimateComplexity(scenario) * severityWeight(scenario.severity);
  const tags = tagFromLabels(scenario.labels);
  return { scenario, tags, score };
};

export const applyScenarioMutations = (
  scenario: IncidentLabScenario,
  commands: readonly DSLCommand[],
): IncidentLabScenario => {
  let workingSteps = [...scenario.steps];

  for (const command of commands) {
    if (command.op === 'add' && command.step && command.step.id && command.index !== undefined) {
      const next: LabTemplateStep = {
        id: command.step.id as StepId,
        label: command.step.label ?? 'generated-step',
        command: command.step.command ?? 'noop',
        expectedDurationMinutes: command.step.expectedDurationMinutes ?? 1,
        dependencies: command.step.dependencies ? [...command.step.dependencies] : [],
        constraints: command.step.constraints ? [...command.step.constraints] : [],
        owner: command.step.owner ?? scenario.steps[0]?.owner ?? ('system' as LabTemplateStep['owner']),
      };
      workingSteps = [
        ...workingSteps.slice(0, command.index),
        next,
        ...workingSteps.slice(command.index),
      ];
    }

    if (command.op === 'remove' && command.stepId) {
      workingSteps = workingSteps.filter((step) => step.id !== command.stepId);
    }

    if (command.op === 'amend' && command.stepId && command.step) {
      workingSteps = workingSteps.map((step) =>
        step.id === command.stepId ? { ...step, ...command.step, id: step.id } : step,
      );
    }

    if (command.op === 'reorder' && command.index !== undefined && command.stepId) {
      const target = workingSteps.find((step) => step.id === command.stepId);
      if (target) {
        workingSteps = workingSteps.filter((step) => step.id !== command.stepId);
        workingSteps = [
          ...workingSteps.slice(0, command.index),
          target,
          ...workingSteps.slice(command.index),
        ];
      }
    }
  }

  return {
    ...scenario,
    steps: workingSteps,
    estimatedRecoveryMinutes: workingSteps.reduce((sum, step) => sum + step.expectedDurationMinutes, 0),
    labels: [...new Set([...scenario.labels, `revision-${Date.now()}`])],
  };
};

export const canonicalText = (scenario: IncidentLabScenario): string =>
  `${scenario.id}|${scenario.owner}|${scenario.steps.length}|${scenario.topologyTags.join(',')}`;

export const detectMutations = (
  source: IncidentLabScenario,
  mutated: IncidentLabScenario,
): readonly DSLCommand[] => {
  const sourceIds = new Set(source.steps.map((step) => step.id));
  const nextIds = new Set(mutated.steps.map((step) => step.id));
  const added = mutated.steps.filter((step) => !sourceIds.has(step.id)).map((step) => ({
    op: 'add' as const,
    step,
    index: Math.max(0, mutated.steps.indexOf(step)),
  }));
  const removed = [...source.steps].filter((step) => !nextIds.has(step.id)).map((step) => ({
    op: 'remove' as const,
    stepId: step.id,
  }));
  return [...added, ...removed];
};
