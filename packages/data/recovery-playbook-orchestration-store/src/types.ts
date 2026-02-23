import type { OrchestrationPlan, OrchestrationOutcome, PolicyViolation, RecoveryPlaybookPolicy, HealthIndicator } from '@domain/recovery-playbook-orchestration';

export interface StoredPlanRecord {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly plan: OrchestrationPlan;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly policyVersion: number;
  readonly requestedBy: string;
}

export interface StoredOutcomeRecord {
  readonly workspaceId: string;
  readonly outcome: OrchestrationOutcome;
  readonly policyViolations: ReadonlyArray<PolicyViolation>;
  readonly createdAt: number;
  readonly reviewedBy?: string;
}

export interface StoreQuery {
  readonly tenantId?: string;
  readonly policyVersion?: number;
}

export interface WorkspaceState {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly policies: Record<string, RecoveryPlaybookPolicy>;
  readonly policiesSnapshotAt: number;
  readonly recentIndicators: ReadonlyArray<HealthIndicator>;
}

export interface WorkspaceAudit {
  readonly workspaceId: string;
  readonly action: 'create' | 'update' | 'delete' | 'run' | 'review';
  readonly actor: string;
  readonly at: string;
  readonly details: string;
}
