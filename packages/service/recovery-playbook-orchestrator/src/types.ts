import type {
  OrchestrationOptions,
  OrchestrationPlan,
  RecoveryPlaybookModel,
  TenantContext,
  DriftSignal,
  OrchestrationOutcome,
  PolicyViolation,
  RecoveryPlaybookPolicy,
  HealthIndicator,
} from '@domain/recovery-playbook-orchestration';
import type { StoredPlanRecord, WorkspaceState } from '@data/recovery-playbook-orchestration-store';

export interface PlaybookWorkspace {
  readonly id: string;
  readonly tenant: TenantContext;
}

export interface PlaybookRunCommand {
  readonly workspaceId: string;
  readonly tenant: TenantContext;
  readonly playbook: RecoveryPlaybookModel;
  readonly signals: readonly DriftSignal[];
  readonly policies?: ReadonlyArray<RecoveryPlaybookPolicy>;
  readonly options?: OrchestrationOptions;
}

export interface RunResult {
  readonly plan: OrchestrationPlan;
  readonly outcome: OrchestrationOutcome;
  readonly policyViolations: PolicyViolation[];
}

export interface OrchestratorSummary {
  readonly workspace: PlaybookWorkspace;
  readonly latestPlan: StoredPlanRecord;
  readonly latestOutcome?: OrchestrationOutcome;
  readonly health: ReadonlyArray<HealthIndicator>;
  readonly signalCount: number;
}

export interface PolicySnapshot {
  readonly workspaceId: string;
  readonly policies: Record<string, RecoveryPlaybookPolicy>;
  readonly timestamp: number;
}
