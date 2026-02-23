import { z } from 'zod';
import { Brand } from '@shared/type-level';
import type {
  CommandPlan,
  CommandPlanStep,
  CommandDefinition,
  CommandConstraint,
  CommandWindow,
} from './types';

export type LabObjectiveId = Brand<string, 'LabObjectiveId'>;
export type LabProfileId = Brand<string, 'LabProfileId'>;

export interface CommandLabObjective {
  readonly id: LabObjectiveId;
  readonly tenantId: string;
  readonly label: string;
  readonly commandId: CommandDefinition['id'];
  readonly targetResource: string;
  readonly desiredThroughput: number;
  readonly maxDowntimeMinutes: number;
  readonly confidence: number;
  readonly constraints: readonly CommandConstraint[];
}

export interface CommandLabPlanProfile {
  readonly id: LabProfileId;
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly objectiveIds: readonly LabObjectiveId[];
  readonly commandIds: readonly CommandDefinition['id'][];
  readonly createdAt: string;
  readonly targetWindow: CommandWindow;
  readonly active: boolean;
}

export interface CommandLabObjectiveSet {
  readonly id: LabObjectiveId;
  readonly label: string;
  readonly objectives: readonly CommandLabObjective[];
}

export interface CommandLabExecutionWindow {
  readonly windowId: string;
  readonly start: string;
  readonly end: string;
  readonly commandCount: number;
  readonly commandIds: readonly CommandDefinition['id'][];
}

export interface CommandLabForecast {
  readonly planId: CommandPlan['id'];
  readonly tenantId: string;
  readonly profileId: LabProfileId;
  readonly objectiveScore: number;
  readonly riskDelta: number;
  readonly estimatedRestorationMinutes: number;
  readonly windows: readonly CommandLabExecutionWindow[];
  readonly generatedAt: string;
}

export interface CommandLabObjectiveSummary {
  readonly objectiveId: LabObjectiveId;
  readonly commandCount: number;
  readonly averageConfidence: number;
  readonly averageCoverage: number;
}

export interface CommandLabPlanDraft extends Omit<CommandLabForecast, 'generatedAt'> {
  readonly commandIds: readonly CommandDefinition['id'][];
  readonly commandCount: number;
}

const parseObjectiveInput = z.object({
  tenantId: z.string().trim().min(1),
  commandId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  targetResource: z.string().trim().min(1),
  desiredThroughput: z.number().finite().nonnegative(),
  maxDowntimeMinutes: z.number().finite().nonnegative(),
  confidence: z.number().min(0).max(1),
});

export const commandLabObjectiveInputSchema = parseObjectiveInput;

export type CommandLabObjectiveInput = z.infer<typeof commandLabObjectiveInputSchema>;

const normalizeConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const normalizeWindowSpan = (start: string, end: string): number => {
  const parsedStart = Date.parse(start);
  const parsedEnd = Date.parse(end);
  if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) {
    return 0;
  }
  if (parsedEnd <= parsedStart) {
    return 0;
  }
  return (parsedEnd - parsedStart) / (60_000 * 60);
};

export const parseLabObjective = (tenantId: string, input: CommandLabObjectiveInput): CommandLabObjective => {
  const parsed = commandLabObjectiveInputSchema.parse(input);
  const objectiveId = `${tenantId}:obj:${Date.now()}` as LabObjectiveId;
  return {
    id: objectiveId,
    tenantId,
    label: parsed.label,
    commandId: parsed.commandId as CommandDefinition['id'],
    targetResource: parsed.targetResource,
    desiredThroughput: parsed.desiredThroughput,
    maxDowntimeMinutes: parsed.maxDowntimeMinutes,
    confidence: normalizeConfidence(parsed.confidence),
    constraints: [
      {
        id: `${tenantId}:constraint:${Date.now()}` as CommandConstraint['id'],
        commandId: parsed.commandId as CommandDefinition['id'],
        reason: `throughput target ${parsed.targetResource}`,
        hard: parsed.maxDowntimeMinutes < 5,
        tags: ['auto-generated'],
      },
    ],
  };
};

export const buildLabObjectiveInput = (tenantId: string, override: CommandLabObjectiveInput): CommandLabObjective => {
  const objective = parseLabObjective(tenantId, override);
  return {
    ...objective,
    confidence: Math.max(0, objective.confidence),
    constraints: [...objective.constraints],
  };
};

export const evaluateObjectiveCoverage = (objective: CommandLabObjective, commands: readonly CommandDefinition[]): number => {
  if (commands.length === 0) {
    return 0;
  }
  const matched = commands.filter((command) => command.id === objective.commandId).length;
  const constraintCount = objective.constraints.length + 1;
  const confidence = normalizeConfidence(objective.confidence);
  const throughput = Math.max(0, Math.min(1, objective.desiredThroughput / 100));
  return Math.max(0, (matched * confidence + throughput) / constraintCount);
};

export const composeExecutionWindows = (
  commands: readonly CommandDefinition[],
): readonly CommandLabExecutionWindow[] => {
  if (commands.length === 0) {
    return [];
  }
  return commands.reduce(
    (windows, command, index) => {
      const windowId = `${command.window.id}:${index}` as string;
      const windowStart = command.window.startsAt;
      const windowEnd = command.window.endsAt;
      const commandCount = command.affectedResources.length;
      const existing = windows.find((entry) => entry.windowId === windowId);
      if (existing) {
        return windows;
      }
      return [
        ...windows,
        {
          windowId,
          start: windowStart,
          end: windowEnd,
          commandCount,
          commandIds: [command.id],
        },
      ];
    },
    [] as CommandLabExecutionWindow[],
  );
};

export const summarizeCommandPlanObjective = (plan: CommandPlan): CommandLabObjectiveSummary[] => {
  const stepCommands = plan.steps
    .map((step) => step.commandId)
    .reduce(
      (acc, commandId) => {
        const existing = acc.get(commandId);
        if (existing === undefined) {
          acc.set(commandId, 1);
          return acc;
        }
        acc.set(commandId, existing + 1);
        return acc;
      },
      new Map<string, number>(),
    );

  const objectives: CommandLabObjectiveSummary[] = [];
  for (const [commandId, commandCount] of stepCommands.entries()) {
    const objectiveId = `${plan.id}:${commandId}` as LabObjectiveId;
    const confidence = Math.min(1, Math.max(0, commandCount / Math.max(1, plan.steps.length)));
    const coverage = Math.min(1, commandCount / 3);
    objectives.push({ objectiveId, commandCount, averageConfidence: confidence, averageCoverage: coverage });
  }

  return objectives;
};

export const buildForecastFromPlan = (plan: CommandPlan, commands: readonly CommandDefinition[]): CommandLabForecast => {
  const windows = composeExecutionWindows(commands.map((command) => ({
    ...command,
    id: command.id,
    title: command.title,
    description: command.description,
    ownerTeam: command.ownerTeam,
    priority: command.priority,
    window: command.window,
    affectedResources: command.affectedResources,
    dependencies: command.dependencies,
    prerequisites: command.prerequisites,
    constraints: command.constraints,
    expectedRunMinutes: command.expectedRunMinutes,
    riskWeight: command.riskWeight,
  })));

  const spanMinutes = windows.reduce((total, window) => total + normalizeWindowSpan(window.start, window.end), 0);
  const objectiveScore = windows.reduce((score, window) => score + window.commandCount, 0);
  const riskDelta = plan.blockedReasons.length * 0.7 + plan.coverage * 0.4 - objectiveScore;
  const estimatedRestorationMinutes = plan.totalRisk + spanMinutes * 1.25;
  const profileId = `${plan.tenantId}:profile:${plan.id}` as LabProfileId;

  return {
    planId: plan.id,
    tenantId: plan.tenantId,
    profileId,
    objectiveScore,
    riskDelta,
    estimatedRestorationMinutes: Math.max(1, Math.round(estimatedRestorationMinutes)),
    windows,
    generatedAt: new Date().toISOString(),
  };
};

export const buildCommandPlanId = (tenantId: string): string => `${tenantId}:command-lab:${Date.now()}`;

export const buildExecutionPlanId = (tenantId: string, seed: string): string =>
  `${tenantId}:execution:${seed}:${Date.now()}`;

export const buildLabPlanDraft = (plan: CommandPlan, selectedStepIds: readonly CommandPlanStep[]): CommandLabPlanDraft => {
  const filtered = plan.steps.filter((step) => selectedStepIds.some((selected) => selected.commandId === step.commandId));
  const commandIds = [...new Set(filtered.map((step) => step.commandId))];
  const windows = composeExecutionWindows(
    filtered.map((step) => {
      const original = plan.steps.find((entry) => entry.commandId === step.commandId);
      const window = original ? original.scheduledWindow : step.scheduledWindow;
      return {
        id: step.commandId,
        title: step.commandTitle,
        description: 'reconstructed from plan step',
        ownerTeam: 'lab',
        priority: 'medium',
        window,
        affectedResources: ['compute'],
        dependencies: [],
        prerequisites: [],
        constraints: [],
        expectedRunMinutes: 5,
        riskWeight: 0.3,
      };
    }),
  );
  const windowsByCount = windows.length;
  return {
    planId: plan.id,
    tenantId: plan.tenantId,
    profileId: `${plan.id}:draft` as LabProfileId,
    objectiveScore: plan.steps.length + commandIds.length,
    riskDelta: Math.max(0, plan.totalRisk - commandIds.length),
    estimatedRestorationMinutes: windowsByCount * 10,
    windows,
    commandIds,
    commandCount: commandIds.length,
  };
};
