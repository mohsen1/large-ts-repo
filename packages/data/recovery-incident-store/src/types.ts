import type {
  IncidentId,
  IncidentRecord,
  IncidentPlan,
  IncidentEvent,
  OrchestrationRun,
  IncidentPlanId,
  WorkItemId,
} from '@domain/recovery-incident-orchestration';

export interface IncidentStoreSnapshot {
  readonly id: IncidentId;
  readonly version: number;
  readonly label: string;
  readonly incident: IncidentRecord;
}

export interface IncidentPlanRecord {
  readonly id: IncidentPlanId;
  readonly incidentId: IncidentId;
  readonly label: string;
  readonly plan: IncidentPlan;
  readonly createdAt: string;
  readonly approvedAt?: string;
}

export interface IncidentRunRecord {
  readonly id: string;
  readonly runId: string;
  readonly planId: IncidentPlanId;
  readonly itemId: WorkItemId;
  readonly run: OrchestrationRun;
  readonly status: 'queued' | 'running' | 'done' | 'failed';
}

export interface IncidentStoreEvent {
  readonly id: string;
  readonly incidentId: IncidentId;
  readonly type: IncidentEvent['type'];
  readonly payload: Record<string, unknown>;
  readonly emittedAt: string;
}

export interface IncidentQuery {
  readonly tenantId?: string;
  readonly region?: string;
  readonly serviceName?: string;
  readonly severityGte?: number;
  readonly unresolvedOnly?: boolean;
  readonly labels?: readonly string[];
  readonly limit?: number;
}

export interface IncidentStoreState {
  readonly incidents: readonly IncidentStoreSnapshot[];
  readonly plans: readonly IncidentPlanRecord[];
  readonly runs: readonly IncidentRunRecord[];
  readonly events: readonly IncidentStoreEvent[];
}

export type QueryResult<T> = {
  readonly total: number;
  readonly data: readonly T[];
};
