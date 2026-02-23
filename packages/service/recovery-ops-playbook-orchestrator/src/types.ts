import type { Brand } from '@shared/core';
import type {
  MergeConfig,
  PlaybookExecutionPlan,
  PlaybookId,
  PlaybookRun,
  PlaybookStepId,
  PlaybookSearchFilters,
  ReadinessSignal,
} from '@domain/recovery-ops-playbook';

export type OrchestrationId = Brand<string, 'OrchestrationId'>;

export interface OrchestratorQuery {
  readonly requestId: OrchestrationId;
  readonly includeDrafts: boolean;
  readonly filters: PlaybookSearchFilters;
  readonly priorityWindowMinutes: number;
}

export interface OrchestrationEvent {
  readonly type: 'plan-built' | 'plan-invalid' | 'run-updated' | 'run-rolled-back';
  readonly ts: string;
  readonly runId: string;
  readonly details: string;
}

export interface OrchestrationSnapshot {
  readonly orchestrationId: OrchestrationId;
  readonly playbookId: PlaybookId;
  readonly run: PlaybookRun;
  readonly projection: {
    readonly playbookId: PlaybookId;
    readonly runId: string;
    readonly activeStep: PlaybookStepId | null;
    readonly completedSteps: readonly PlaybookStepId[];
    readonly failedSteps: readonly PlaybookStepId[];
    readonly confidence: number;
  };
  readonly trace: readonly OrchestrationTrace[];
}

export interface OrchestrationTrace {
  readonly timestamp: string;
  readonly action: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface OrchestratorCommand {
  readonly type: 'start' | 'pause' | 'resume' | 'rollback' | 'finalize';
  readonly runId: string;
  readonly reason: string;
  readonly actor: string;
}

export interface OrchestrationPlanBundle {
  readonly plan: PlaybookExecutionPlan;
  readonly planConfig: MergeConfig;
  readonly events: readonly OrchestrationEvent[];
  readonly signals: Readonly<ReadinessSignal[]>;
  readonly readyForApproval: boolean;
}

export interface OrchestratorAdapter {
  readonly executeCommand: (command: OrchestratorCommand) => Promise<{ ok: true } | { ok: false; error: Error }>;
}

export interface OrchestrationStore {
  readonly saveRun: (run: PlaybookRun) => Promise<void>;
  readonly saveTrace: (trace: OrchestrationTrace) => Promise<void>;
  readonly getRun: (runId: string) => Promise<PlaybookRun | undefined>;
}
