import type { IncidentId } from '@domain/recovery-incident-orchestration';
import type {
  IncidentPlanId,
  IncidentRecord,
} from '@domain/recovery-incident-orchestration';
import type {
  WorkflowBundle,
  WorkflowTemplate,
  WorkflowInstance,
  WorkflowRun,
  WorkflowTemplateId,
  WorkflowInstanceId,
} from '@domain/recovery-incident-workflows';

export const workflowRecordStates = ['active', 'retired', 'draft', 'archived'] as const;
export type WorkflowRecordState = (typeof workflowRecordStates)[number];

export interface WorkflowStoreSnapshot {
  readonly workflowCount: number;
  readonly runCount: number;
  readonly lastUpdated: string;
}

export interface WorkflowStoreRecord {
  readonly id: WorkflowTemplateId;
  readonly state: WorkflowRecordState;
  readonly template: WorkflowTemplate;
  readonly instance: WorkflowInstance;
  readonly updatedAt: string;
  readonly incidents: readonly IncidentId[];
  readonly planId: IncidentPlanId;
}

export interface WorkflowRunRecord {
  readonly id: string;
  readonly planId: IncidentPlanId;
  readonly runId: WorkflowRun['id'];
  readonly instanceId: WorkflowInstanceId;
  readonly run: WorkflowRun;
  readonly status: WorkflowRun['result'];
}

export interface WorkflowQuery {
  readonly tenantId?: string;
  readonly planId?: IncidentPlanId;
  readonly minRisk?: number;
  readonly includeHistory?: boolean;
}

export interface WorkflowQueryResult {
  readonly total: number;
  readonly records: readonly WorkflowStoreRecord[];
  readonly histories: readonly WorkflowRunRecord[];
}

export interface WorkflowHistoryWindow {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly totalRuns: number;
  readonly successRate: number;
}

export const buildWorkflowQueryKey = (query: WorkflowQuery): string =>
  `${query.tenantId ?? 'all'}:${query.planId ?? 'none'}:${query.minRisk ?? 'any'}:${query.includeHistory ?? false}`;

export const emptyHistoryWindow = (start: string, end: string): WorkflowHistoryWindow => ({
  windowStart: start,
  windowEnd: end,
  totalRuns: 0,
  successRate: 0,
});

export const toIncidentIds = (record: WorkflowStoreRecord, incident: IncidentRecord): readonly IncidentId[] => [
  incident.id,
  ...record.incidents.filter((id): id is IncidentId => id !== incident.id),
];

export const mkBundleId = (template: WorkflowTemplate): WorkflowTemplateId =>
  template.id;
