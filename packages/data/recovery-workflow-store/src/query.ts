import type {
  WorkflowBundle,
  WorkflowTemplate,
  WorkflowTemplateId,
} from '@domain/recovery-incident-workflows';
import type { IncidentRecord, IncidentScope } from '@domain/recovery-incident-orchestration';
import type { WorkflowStoreRecord, WorkflowQueryResult, WorkflowHistoryWindow } from './types';

export interface WorkflowSummary {
  readonly templateId: WorkflowTemplateId;
  readonly scopeLabel: string;
  readonly runCount: number;
  readonly activeRuns: number;
}

export interface TenantWindow {
  readonly tenantId: string;
  readonly count: number;
}

const scopeLabel = (scope: IncidentScope): string => `${scope.tenantId}/${scope.clusterId}/${scope.serviceName}`;

export const groupByTenant = (records: readonly WorkflowStoreRecord[]): readonly TenantWindow[] => {
  const byTenant = new Map<string, number>();
  for (const record of records) {
    const tenantId = record.template.scope.tenantId;
    byTenant.set(tenantId, (byTenant.get(tenantId) ?? 0) + 1);
  }
  return [...byTenant.entries()]
    .map(([tenantId, count]) => ({ tenantId, count }))
    .sort((left, right) => right.count - left.count);
};

export const summarizeTemplates = (records: readonly WorkflowStoreRecord[]): readonly WorkflowSummary[] =>
  records.map((record) => ({
    templateId: record.id,
    scopeLabel: scopeLabel(record.template.scope),
    runCount: record.instance.runIds.length,
    activeRuns: record.instance.status === 'running' ? 1 : 0,
  }));

export const summarizeQuery = (result: WorkflowQueryResult): {
  readonly totalsByTenant: readonly TenantWindow[];
  readonly totalWorkflows: number;
  readonly hasHistory: boolean;
} => ({
  totalsByTenant: groupByTenant(result.records),
  totalWorkflows: result.total,
  hasHistory: result.histories.length > 0,
});

export const buildHistoryWindow = (
  records: readonly WorkflowStoreRecord[],
  windowMinutes = 30,
): WorkflowHistoryWindow => {
  const ended = new Date();
  const started = new Date(ended.getTime() - windowMinutes * 60_000);
  return {
    windowStart: started.toISOString(),
    windowEnd: ended.toISOString(),
    totalRuns: records.reduce((total, record) => total + record.instance.runIds.length, 0),
    successRate: Math.min(100, records.length * 10),
  };
};

export const findByScope = (
  records: readonly WorkflowStoreRecord[],
  tenantId: string,
): readonly WorkflowStoreRecord[] =>
  records.filter((record) => record.template.scope.tenantId === tenantId);

export const rankTemplates = (
  records: readonly WorkflowStoreRecord[],
  incident: IncidentRecord,
): readonly WorkflowTemplate[] =>
  records
    .filter((record) => record.template.scope.region === incident.scope.region)
    .map((record) => record.template);
