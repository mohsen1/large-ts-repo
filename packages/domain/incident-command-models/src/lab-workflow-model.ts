import { z } from 'zod';
import { Brand, NonEmptyArray } from '@shared/type-level';
import type {
  CommandDefinition,
  RecoveryCommand,
  CommandConstraint,
  CommandWindow,
  CommandPlanStep,
} from './types';

export type CommandLabWorkspaceId = Brand<string, 'CommandLabWorkspaceId'>;
export type CommandLabSessionId = Brand<string, 'CommandLabSessionId'>;
export type CommandLabRunId = Brand<string, 'CommandLabRunId'>;

export interface CommandLabStepState {
  readonly stepId: CommandPlanStep['commandId'];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly state: CommandPlanStep['status'];
  readonly message: string;
  readonly tags: readonly string[];
}

export interface CommandLabSession {
  readonly id: CommandLabSessionId;
  readonly workspaceId: CommandLabWorkspaceId;
  readonly tenantId: string;
  readonly runBy: string;
  readonly targetWindowMinutes: number;
  readonly commands: readonly RecoveryCommand[];
  readonly queuedCommands: readonly CommandDefinition['id'][];
  readonly blockedCommands: readonly CommandDefinition['id'][];
  readonly stepStates: readonly CommandLabStepState[];
}

export interface CommandLabWorkspace {
  readonly id: CommandLabWorkspaceId;
  readonly tenantId: string;
  readonly label: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sessions: readonly CommandLabSession[];
  readonly sessionsByState: Record<CommandPlanStep['status'], number>;
}

export interface CommandLabDependencyMap {
  readonly commandId: CommandDefinition['id'];
  readonly dependsOn: readonly CommandDefinition['id'][];
  readonly blockedBy: readonly CommandDefinition['id'][];
}

export interface CommandLabLane {
  readonly laneId: Brand<string, 'LabLaneId'>;
  readonly resourceClass: CommandWindow['preferredClass'];
  readonly capacity: number;
  readonly commands: readonly CommandLabDependencyMap[];
}

export interface CommandLabExecutionPlan {
  readonly runId: CommandLabRunId;
  readonly planId: string;
  readonly createdAt: string;
  readonly estimatedMinutes: number;
  readonly lanes: readonly CommandLabLane[];
  readonly commands: readonly RecoveryCommand[];
}

export interface CommandLabScheduleMatrix {
  readonly runId: CommandLabRunId;
  readonly sessions: number;
  readonly lanes: Record<string, readonly CommandLabDependencyMap[]>;
}

const commandIdListSchema = z.object({
  tenantId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  commandIds: z.array(z.string().trim().min(1)).min(1),
  targetWindowMinutes: z.number().int().min(1),
  requestedBy: z.string().trim().min(1),
});

export const commandLabSessionInputSchema = commandIdListSchema;
export type CommandLabSessionInput = z.infer<typeof commandLabSessionInputSchema>;

export const normalizeWindowMinutes = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 10;
  }
  if (value <= 0) {
    return 1;
  }
  if (value > 24 * 60) {
    return 24 * 60;
  }
  return Math.trunc(value);
};

export const makeWorkspaceId = (tenantId: string): CommandLabWorkspaceId =>
  `${tenantId}:workspace:${Date.now()}` as CommandLabWorkspaceId;

export const makeSessionId = (workspaceId: string): CommandLabSessionId =>
  `${workspaceId}:session:${Math.random().toString(36).slice(2, 8)}` as CommandLabSessionId;

export const makeRunId = (sessionId: string): CommandLabRunId =>
  `${sessionId}:run:${Date.now()}` as CommandLabRunId;

export const parseCommandLabSessionInput = (input: CommandLabSessionInput): CommandLabSession => {
  const parsed = commandLabSessionInputSchema.parse(input);
  return {
    id: makeSessionId(`tenant:${parsed.tenantId}`),
    workspaceId: makeWorkspaceId(parsed.tenantId),
    tenantId: parsed.tenantId,
    runBy: parsed.requestedBy,
    targetWindowMinutes: normalizeWindowMinutes(parsed.targetWindowMinutes),
    commands: [],
    queuedCommands: [...parsed.commandIds] as CommandDefinition['id'][],
    blockedCommands: [],
    stepStates: [],
  };
};

export const sortWindowsByDependency = (commands: readonly RecoveryCommand[]): readonly RecoveryCommand[] => {
  const lookup = new Map<string, RecoveryCommand>();
  for (const command of commands) {
    lookup.set(String(command.id), command);
  }

  const visited = new Set<string>();
  const output: RecoveryCommand[] = [];

  const visit = (commandId: string): void => {
    const existing = lookup.get(commandId);
    if (!existing) {
      return;
    }
    if (visited.has(commandId)) {
      return;
    }
    visited.add(commandId);
    for (const dep of existing.dependencies) {
      visit(String(dep));
    }
    output.push(existing);
  };

  for (const command of commands) {
    visit(String(command.id));
  }

  return output;
};

const computeLaneId = (resourceClass: CommandWindow['preferredClass']): CommandLabLane['laneId'] =>
  `${resourceClass}-${Date.now()}`.toLowerCase() as CommandLabLane['laneId'];

export const buildDependencyMatrix = (commands: readonly RecoveryCommand[]): readonly CommandLabDependencyMap[] => {
  return commands.map((command) => {
    const blockedBy = command.dependencies.filter((dependency) => !commands.some((candidate) => candidate.id === dependency));
    return {
      commandId: command.id,
      dependsOn: command.dependencies,
      blockedBy,
    };
  });
};

export const buildExecutionPlan = (tenantId: string, runId: string, commands: readonly RecoveryCommand[]): CommandLabExecutionPlan => {
  const sorted = sortWindowsByDependency(commands);
  const mapByResource = new Map<CommandWindow['preferredClass'], CommandLabDependencyMap[]>();
  const dependencyMap = buildDependencyMatrix(sorted);

  for (const entry of dependencyMap) {
    const resourceClass = sorted.find((command) => command.id === entry.commandId)?.window.preferredClass ?? 'compute';
    const current = mapByResource.get(resourceClass) ?? [];
    mapByResource.set(resourceClass, [...current, entry]);
  }

  const lanes: CommandLabLane[] = [];
  for (const [resourceClass, values] of mapByResource.entries()) {
    const cap = values.reduce((acc, entry) => acc + entry.dependsOn.length, 0) + 1;
    lanes.push({
      laneId: computeLaneId(resourceClass),
      resourceClass,
      capacity: cap,
      commands: values,
    });
  }

  const estimatedMinutes = Math.max(1, sorted.reduce((sum, command) => sum + command.expectedRunMinutes, 0));

  return {
    runId: makeRunId(runId),
    planId: `${tenantId}:plan:${runId}`,
    createdAt: new Date().toISOString(),
    estimatedMinutes,
    lanes,
    commands: sorted,
  };
};

export const summarizeExecutionPlan = (plan: CommandLabExecutionPlan): CommandLabScheduleMatrix => {
  const sessions = plan.commands.reduce((count, command) => count + command.dependencies.length + 1, 0);
  const lanes: Record<string, readonly CommandLabDependencyMap[]> = {};
  for (const lane of plan.lanes) {
    lanes[lane.laneId] = lane.commands;
  }
  return {
    runId: plan.runId,
    sessions,
    lanes,
  };
};

export const toConstraintEnvelope = (
  command: RecoveryCommand,
  constraints: readonly CommandConstraint[],
): { readonly commandId: string; readonly count: number } => ({
  commandId: command.id,
  count: constraints.length + command.constraints.length,
});

export const mergeConstraintSources = (
  base: readonly CommandConstraint[],
  extra: readonly CommandConstraint[],
): readonly CommandConstraint[] => {
  const seen = new Set<string>();
  const out: CommandConstraint[] = [];
  for (const constraint of [...base, ...extra]) {
    const key = `${constraint.commandId}:${constraint.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(constraint);
  }
  return out;
};

export const hasBlockingChain = (commands: readonly RecoveryCommand[]): boolean => {
  return commands.some((command) => command.dependencies.some((dependency) => dependency.length > 0 && dependency.startsWith('block')));
};

export const splitIntoSemantics = (commands: readonly RecoveryCommand[]): {
  readonly critical: NonEmptyArray<RecoveryCommand>;
  readonly nonCritical: readonly RecoveryCommand[];
} => {
  const critical: RecoveryCommand[] = [];
  const nonCritical: RecoveryCommand[] = [];
  for (const command of commands) {
    if (command.riskWeight >= 0.5 || command.ownerTeam.includes('critical')) {
      critical.push(command);
    } else {
      nonCritical.push(command);
    }
  }
  if (critical.length === 0) {
    return {
      critical: [commands[0], ...commands.slice(1)] as NonEmptyArray<RecoveryCommand>,
      nonCritical: [],
    };
  }
  return {
    critical: critical as NonEmptyArray<RecoveryCommand>,
    nonCritical,
  };
};
