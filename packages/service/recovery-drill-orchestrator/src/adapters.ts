import type { DrillDependencies, DrillProgressEvent, DrillRunPlan, DrillStartInput } from './types';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { DrillCatalogFilter } from './types';
import type { RecoveryDrillTenantId, DrillMode } from '@domain/recovery-drill/src';
import type { DrillStoreQuery } from '@data/recovery-drill-store/src';
import { computeTenantMetrics, summarizeMetricRows } from './metrics';
import type { DrillTemplateRecord, DrillRunRecord } from '@data/recovery-drill-store/src';

export interface DrillStoreAdapter {
  listTemplateSnapshots: (tenantId: RecoveryDrillTenantId) => Promise<readonly DrillTemplateRecord[]>;
  listRuns: (query: DrillStoreQuery) => Promise<{ items: readonly DrillRunRecord[]; total: number }>; 
}

export interface DrillHealthProbe {
  readonly tenant: RecoveryDrillTenantId;
  readonly healthy: boolean;
  readonly activeRuns: number;
  readonly lastError?: string;
}

export const toStoreQuery = (filter: DrillCatalogFilter): DrillStoreQuery => ({
  tenant: filter.tenant as RecoveryDrillTenantId,
  status: filter.status,
  from: undefined,
  to: undefined,
});

export const createStartInput = (
  templateId: string,
  initiatedBy: string,
  mode?: DrillMode,
  runAt?: string,
): DrillStartInput => ({
  templateId: templateId as any,
  initiatedBy,
  mode,
  runAt,
  approvals: 1,
});

export const normalizeProgressEvent = (runId: string, status: string): DrillProgressEvent => ({
  runId: runId as any,
  status: status as DrillProgressEvent['status'],
  at: new Date().toISOString(),
  details: `status:${status}`,
});

export const buildNotifierEvent = (runId: string, status: string, details?: string): DrillProgressEvent => ({
  runId: runId as any,
  status: status as DrillProgressEvent['status'],
  at: new Date().toISOString(),
  details,
});

export const evaluateHealth = async (dependencies: Pick<DrillDependencies, 'templates' | 'runs'>, tenant: RecoveryDrillTenantId): Promise<DrillHealthProbe> => {
  try {
    const templates = await dependencies.templates.listTemplates(tenant);
    const runs = await dependencies.runs.listRuns({ tenant } as DrillStoreQuery);
    const metrics = computeTenantMetrics(templates, runs.items, tenant);
    return {
      tenant,
      healthy: metrics.successRate >= 0,
      activeRuns: metrics.activeRuns,
      lastError: metrics.topHeatpointTemplate ? undefined : 'no-top-template',
    };
  } catch (error) {
    return {
      tenant,
      healthy: false,
      activeRuns: 0,
      lastError: (error as Error).message,
    };
  }
};

export const summarizeTenantRuns = (runs: readonly DrillRunRecord[]): { active: number; total: number; failed: number } => {
  return {
    active: runs.filter((run) => run.status === 'running' || run.status === 'queued' || run.status === 'paused').length,
    total: runs.length,
    failed: runs.filter((run) => run.status === 'failed').length,
  };
};

export const snapshotFromRuns = (runs: readonly DrillRunRecord[]) => {
  const metricRows = summarizeMetricRows([], runs);
  return {
    total: runs.length,
    active: runs.filter((run) => run.status === 'running' || run.status === 'queued').length,
    rows: metricRows,
  };
};

export const safeParseTenant = (value: string): Result<RecoveryDrillTenantId, Error> => {
  if (!value || !value.trim()) {
    return fail(new Error('tenant-empty'));
  }
  return ok(value as RecoveryDrillTenantId);
};
