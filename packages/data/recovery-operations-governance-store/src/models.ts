import type { PolicyEvaluationOutcome } from '@domain/recovery-operations-governance';
import type { Brand } from '@shared/core';

export type GovernanceStoreTenant = Brand<string, 'TenantId'>;

export interface PolicyHistoryRecord {
  readonly tenant: GovernanceStoreTenant;
  readonly runId: string;
  readonly policyId: string;
  readonly evaluatedAt: string;
  readonly blocked: boolean;
  readonly score: number;
  readonly findings: readonly PolicyEvaluationOutcome['findings'];
}

export interface PolicyStoreFilter {
  readonly tenant?: string;
  readonly policyId?: string;
  readonly blocked?: boolean;
  readonly from?: string;
  readonly to?: string;
}

export interface GovernanceStoreSnapshot {
  readonly tenant: GovernanceStoreTenant;
  readonly lastRunId: string;
  readonly records: readonly PolicyHistoryRecord[];
}
