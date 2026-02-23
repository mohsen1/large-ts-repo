import type { JsonValue } from '@shared/type-level';
import type {
  OrchestrationLab,
  OrchestrationLabEnvelope,
  OrchestrationLabId,
  LabRunId,
  LabPlanId,
  LabPlan,
} from '@domain/recovery-ops-orchestration-lab';

export type { OrchestrationLab, OrchestrationLabEnvelope, OrchestrationLabId, LabRunId, LabPlan, LabPlanId };

export interface OrchestrationLabRecord {
  readonly envelope: OrchestrationLabEnvelope;
  readonly selectedPlanId?: LabPlan['id'];
  readonly lastError?: string;
}

export interface StoreSummary {
  readonly totalLabs: number;
  readonly totalRuns: number;
  readonly selectedPlanCount: number;
  readonly lastUpdated: string;
}

export interface RunRecordInput {
  readonly runId: string;
  readonly labId: OrchestrationLabId;
  readonly planId: LabPlan['id'];
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: 'running' | 'succeeded' | 'failed' | 'paused';
  readonly logs: readonly string[];
}

export interface LabRunRecord {
  readonly runId: LabRunId;
  readonly labId: OrchestrationLabId;
  readonly planId: LabPlan['id'];
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: 'running' | 'succeeded' | 'failed' | 'paused';
  readonly logs: readonly string[];
}

export interface LabQueryFilter {
  readonly tenantId?: string;
  readonly scenarioId?: string;
  readonly signalTier?: 'signal' | 'warning' | 'critical';
  readonly page?: number;
  readonly pageSize?: number;
}

export interface PagedResult<T> {
  readonly data: readonly T[];
  readonly page: number;
  readonly total: number;
  readonly pageSize: number;
}

export interface QueryAudit {
  readonly createdAt: string;
  readonly totalScans: number;
  readonly tags: readonly string[];
  readonly context: Record<string, JsonValue>;
}

export interface WindowAllocation {
  readonly labId: OrchestrationLabId;
  readonly planId: LabPlan['id'];
  readonly windowId: string;
}

export interface LabStoreSnapshot {
  readonly labs: readonly OrchestrationLab[];
  readonly windows: readonly WindowAllocation[];
  readonly runs: readonly LabRunRecord[];
  readonly summary: StoreSummary;
  readonly auditTrail: readonly QueryAudit[];
}
