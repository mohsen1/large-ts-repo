import type { RecoveryCommand, CommandPlan, SimulationResult, CommandDefinition, CommandRunSignal } from '@domain/incident-command-models';
import type { Brand } from '@shared/core';

export type OrchestrationRunId = Brand<string, 'OrchestrationRunId'>;

export interface OrchestrationCommandInput {
  tenantId: string;
  requestedBy: string;
  commands: readonly RecoveryCommand[];
  windowMinutes: number;
  dryRun: boolean;
}

export interface OrchestrationContext {
  now: string;
  runId: OrchestrationRunId;
  tenantId: string;
  requestedBy: string;
}

export interface CandidateCommand {
  command: RecoveryCommand;
  score: number;
  blockedReasonCount: number;
}

export interface PlanDraft {
  plan: CommandPlan;
  candidates: readonly CandidateCommand[];
}

export interface SimulationInput {
  tenantId: string;
  commands: readonly CommandDefinition[];
  windowMinutes: number;
}

export interface SimulationRun {
  result: SimulationResult;
  signals: readonly CommandRunSignal[];
  createdAt: string;
}

export interface ExecutionInput {
  planId: OrchestrationRunId;
  tenantId: string;
  commandIds: readonly string[];
  force: boolean;
}

export interface ExecutionStatus {
  runId: OrchestrationRunId;
  executedAt: string;
  ok: boolean;
  details: readonly string[];
}
