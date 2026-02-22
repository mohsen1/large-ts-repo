import { withBrand } from '@shared/core';
import type { Brand, DeepReadonly, Merge, Prettify } from '@shared/type-level';
import type {
  IncidentRecord,
  IncidentId,
  IncidentPlan,
  OrchestrationRun,
  IncidentPlanId,
  SeverityBand,
} from '@domain/recovery-incident-orchestration';

export const commandStates = ['draft', 'queued', 'running', 'blocked', 'finished', 'cancelled'] as const;
export type CommandState = (typeof commandStates)[number];

export type CommandId = Brand<string, 'CommandId'>;
export type PlaybookId = Brand<string, 'PlaybookId'>;
export type CommandTemplateId = Brand<string, 'CommandTemplateId'>;

export const commandActionKinds = ['play', 'safeguard', 'rollback', 'notify', 'escalate', 'evidence'] as const;
export type CommandActionKind = (typeof commandActionKinds)[number];

export interface BaseCommandAction {
  readonly id: CommandId;
  readonly label: string;
  readonly owner: string;
  readonly actionKind: CommandActionKind;
  readonly severity: SeverityBand;
  readonly dependsOn: readonly CommandId[];
  readonly expectedDurationMinutes: number;
  readonly metadata: Record<string, string>;
}

export interface ExecutionStepConstraint {
  readonly requiresHumanApproval: boolean;
  readonly maxRetryAttempts: number;
  readonly backoffMinutes: number;
  readonly abortOnFailure: boolean;
  readonly allowedRegions: readonly string[];
}

export interface CommandPlaybookCommand extends BaseCommandAction {
  readonly instructions: readonly string[];
  readonly parameters: Record<string, unknown>;
}

export interface CommandPlaybook {
  readonly id: PlaybookId;
  readonly incidentId: IncidentId;
  readonly templateName: string;
  readonly templateVersion: string;
  readonly commands: readonly CommandPlaybookCommand[];
  readonly constraints: ExecutionStepConstraint;
  readonly generatedAt: string;
}

export interface CommandTemplate {
  readonly id: CommandTemplateId;
  readonly name: string;
  readonly description: string;
  readonly commandHints: readonly string[];
  readonly priorityModifier: number;
  readonly safetyWindowMinutes: number;
}

export interface CommandRunbook {
  readonly id: PlaybookId;
  readonly incidentId: IncidentId;
  readonly plan: IncidentPlan;
  readonly template: CommandTemplate;
  readonly playbook: CommandPlaybook;
  readonly state: CommandState;
  readonly stateTransitions: readonly {
    readonly at: string;
    readonly state: CommandState;
    readonly operator: string;
    readonly note?: string;
  }[];
  readonly riskScore: number;
}

export interface CommandExecutionEvent {
  readonly id: Brand<string, 'CommandExecutionEvent'>;
  readonly runbookId: PlaybookId;
  readonly commandId: CommandId;
  readonly result: 'ok' | 'fail' | 'warn';
  readonly occurredAt: string;
  readonly details: Record<string, unknown>;
}

export interface CommandExecutionFrame {
  readonly commandId: CommandId;
  readonly state: CommandState;
  readonly command: CommandPlaybookCommand;
  readonly run: OrchestrationRun | undefined;
  readonly event?: CommandExecutionEvent;
}

export interface ExecutionGraph {
  readonly runbookId: PlaybookId;
  readonly commandIds: readonly CommandId[];
  readonly adjacency: ReadonlyMap<CommandId, readonly CommandId[]>;
}

export type CommandTemplateOptions = Prettify<
  Merge<{
    includeNotifyOnly: boolean;
    maxParallelism: number;
  }, {
    minimumReadinessScore: number;
    maxRiskScore: number;
    includeRollbackWindowMinutes: number;
  }>
>;

export interface SimulationConstraintViolation {
  readonly commandId: CommandId;
  readonly reason: string;
}

export interface PlaybookSimulation {
  readonly runbook: CommandRunbook;
  readonly frameOrder: readonly CommandId[];
  readonly parallelism: number;
  readonly expectedFinishAt: string;
  readonly violations: readonly SimulationConstraintViolation[];
}

export interface CommandPlanDigest {
  readonly runbookId: PlaybookId;
  readonly commandCount: number;
  readonly blockedCount: number;
  readonly failureRisk: 'low' | 'medium' | 'high';
  readonly estimatedMinutes: number;
}

export const buildCommandId = (prefix: string, index: number, command: string): CommandId =>
  withBrand(`${prefix}:cmd:${index}:${command}`.toLowerCase(), 'CommandId');

export const buildPlaybookId = (incidentId: IncidentId, planId: IncidentPlanId): PlaybookId =>
  withBrand(`${String(incidentId)}:${String(planId)}:${Date.now()}`, 'PlaybookId');

export const buildCommandTemplateId = (name: string, tenant: string): CommandTemplateId =>
  withBrand(`${tenant}:${name.toLowerCase().replace(/\s+/g, '-')}`, 'CommandTemplateId');

export const buildCommandDigest = (
  runbook: CommandRunbook,
  violations: readonly SimulationConstraintViolation[],
): CommandPlanDigest => {
  const blockedCount = runbook.playbook.commands.filter((command) => command.actionKind === 'safeguard').length;
  const estimatedMinutes = runbook.playbook.commands.reduce((sum, command) => sum + command.expectedDurationMinutes, 0);
  const score = runbook.riskScore + runbook.template.priorityModifier;
  const failureRisk: 'low' | 'medium' | 'high' =
    score < 2 ? 'low' : score < 4 ? 'medium' : 'high';

  return {
    runbookId: runbook.id,
    commandCount: runbook.playbook.commands.length,
    blockedCount,
    failureRisk: violations.length > 0 ? 'high' : failureRisk,
    estimatedMinutes,
  };
};

export const toDeepReadonlySimulation = <T>(value: T): DeepReadonly<T> => value as DeepReadonly<T>;
