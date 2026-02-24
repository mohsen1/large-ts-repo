import type { WorkflowStoreRecord } from '../types';
import type { ContinuityWorkspace, ContinuityExecutionTrace } from '@domain/recovery-incident-workflows';
import { buildWorkspaceViews } from './adapters';
import { defaultPageSize, listByCursor } from '@data/repositories';

export interface ContinuitySeriesPoint {
  readonly cursor: string;
  readonly value: number;
  readonly label: string;
}

export interface ContinuitySeries {
  readonly points: readonly ContinuitySeriesPoint[];
  readonly windowMinutes: number;
}

export const summarizeContinuityByTenant = (records: readonly WorkflowStoreRecord[]): readonly { tenant: string; count: number }[] => {
  const byTenant = new Map<string, number>();
  for (const record of records) {
    const tenant = record.template.scope.tenantId;
    byTenant.set(tenant, (byTenant.get(tenant) ?? 0) + 1);
  }
  return [...byTenant.entries()].map(([tenant, count]) => ({ tenant, count }));
};

export const summarizeTraceDurations = (trace: ContinuityExecutionTrace): number => {
  return trace.windows.reduce((acc, entry) => {
    if (!entry.endedAt) {
      return acc;
    }
    return acc + Math.max(0, new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime());
  }, 0);
};

export const toSeries = (records: readonly WorkflowStoreRecord[], bucketMinutes = 30): ContinuitySeries => {
  const byTenant = summarizeContinuityByTenant(records);
  const total = byTenant.reduce((acc, item) => acc + item.count, 0);
  const points = byTenant.map((entry, index) => ({
    cursor: `#${index}`,
    value: total === 0 ? 0 : (entry.count / total) * 100,
    label: `${entry.tenant}=${entry.count}`,
  }));
  return { points, windowMinutes: bucketMinutes };
};

export const rankWorkspaces = (
  workspaces: readonly ContinuityWorkspace[],
): readonly { workspace: ContinuityWorkspace; score: number }[] => {
  const views = workspaces.map((workspace) => ({
    workspace,
    score: workspace.templates.reduce((acc, template) => acc + template.nodes.length, 0),
  }));

  return views.sort((left, right) => right.score - left.score);
};

export const bucketByRisk = async (
  store: {
    records: () => Promise<readonly WorkflowStoreRecord[]>;
  },
): Promise<readonly { band: 'low' | 'medium' | 'high' | 'critical'; count: number }[]> => {
  const records = await store.records();
  const buckets = new Map<string, number>();
  const bandFromWeight = (riskWeight: number): 'low' | 'medium' | 'high' | 'critical' => {
    if (riskWeight >= 95) {
      return 'critical';
    }
    if (riskWeight >= 75) {
      return 'high';
    }
    if (riskWeight >= 45) {
      return 'medium';
    }
    return 'low';
  };
  for (const record of records) {
    const risk = bandFromWeight(record.template.route.riskWeight);
    buckets.set(risk, (buckets.get(risk) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([band, count]) => ({ band: band as 'low' | 'medium' | 'high' | 'critical', count }));
};

export const withRepositorySlices = async (
  repository: {
    all: () => Promise<readonly WorkflowStoreRecord[]>;
    save: (record: WorkflowStoreRecord) => Promise<void>;
    remove: (id: string) => Promise<void>;
  },
  workspaces: readonly ContinuityWorkspace[],
): Promise<{ readonly views: number; readonly buckets: number }> => {
  const existing = await repository.all();
  const policyByTemplate = workspaces.flatMap((workspace) =>
    workspace.templates.map((template) => [template.id, template.policy] as const),
  );
  const mapped = buildWorkspaceViews(existing, policyByTemplate);
  for (const entry of mapped) {
    void entry;
  }

  for (const item of existing) {
    if (!item.template) {
      await repository.remove(item.id);
    }
  }

  return {
    views: mapped.length,
    buckets: new Set(mapped.map((entry) => entry.tenant)).size,
  };
};

export const paginateRecords = (records: readonly WorkflowStoreRecord[], limit = defaultPageSize) => {
  return listByCursor(records, {
    sortBy: (left, right) => right.updatedAt.localeCompare(left.updatedAt),
    limit,
  });
};
