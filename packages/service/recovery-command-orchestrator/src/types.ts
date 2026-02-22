import type { Brand } from '@shared/type-level';
import type { IncidentId, IncidentPlanId, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import type { IncidentPlan } from '@domain/recovery-incident-orchestration';
import type {
  CommandRunbook,
  CommandExecutionFrame,
  CommandTemplateOptions,
  PlaybookSimulation,
  CommandState,
} from '@domain/incident-command-core';

export type CommandOrchestratorMode = 'simulation' | 'execution' | 'dry-run';

export interface CommandOrchestratorConfig {
  readonly maxQueued: number;
  readonly maxParallelism: number;
  readonly mode: CommandOrchestratorMode;
  readonly policy: CommandTemplateOptions;
}

export interface CommandOrchestratorContext {
  readonly incidentId: IncidentId;
  readonly planId: IncidentPlanId;
  readonly operator: string;
}

export interface CommandOrchestratorLog {
  readonly id: Brand<string, 'CommandLogId'>;
  readonly runbookId: CommandRunbook['id'];
  readonly state: CommandState;
  readonly at: string;
  readonly message: string;
  readonly metadata: Record<string, unknown>;
}

export interface CommandOrchestratorRun {
  readonly payload: {
    readonly source: string;
    readonly context: {
      readonly operator: string;
      readonly incidentId: IncidentId;
      readonly planId: IncidentPlanId;
    };
  };
  readonly runbook: CommandRunbook;
  readonly simulation: PlaybookSimulation;
  readonly frames: readonly CommandExecutionFrame[];
}

export interface CommandOrchestratorReport {
  readonly runbookId: CommandRunbook['id'];
  readonly frameCount: number;
  readonly plannedMinutes: number;
  readonly executedRuns: number;
  readonly logs: readonly CommandOrchestratorLog[];
}

export interface PlanExecutionResult {
  readonly plan: IncidentPlan;
  readonly commandRuns: readonly OrchestrationRun[];
}
