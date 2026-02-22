import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoverySimulationResult, PlanId, ScenarioId, TenantId } from '@domain/recovery-scenario-planner/src';
import type { StoredScenarioRecord, StoredScenarioSummary, ScenarioStoreSnapshot } from './models';

export interface RecoveryScenarioRepository {
  save(record: StoredScenarioRecord): Promise<Result<void, Error>>;
  get(scenarioId: ScenarioId): Promise<Result<StoredScenarioRecord | undefined, Error>>;
  listByTenant(tenantId: TenantId): Promise<Result<readonly StoredScenarioSummary[], Error>>;
  listLatest(limit: number): Promise<Result<readonly StoredScenarioSummary[], Error>>;
  archive(scenarioId: ScenarioId): Promise<Result<void, Error>>;
}

export class InMemoryRecoveryScenarioRepository implements RecoveryScenarioRepository {
  private readonly records = new Map<string, StoredScenarioRecord>();
  private readonly byTenant = new Map<string, Set<string>>();

  async save(record: StoredScenarioRecord): Promise<Result<void, Error>> {
    try {
      this.records.set(record.scenarioId, record);
      const bucket = this.byTenant.get(record.tenantId) ?? new Set<string>();
      bucket.add(record.scenarioId);
      this.byTenant.set(record.tenantId, bucket);
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async get(scenarioId: ScenarioId): Promise<Result<StoredScenarioRecord | undefined, Error>> {
    return ok(this.records.get(scenarioId));
  }

  async listByTenant(tenantId: TenantId): Promise<Result<readonly StoredScenarioSummary[], Error>> {
    const ids = Array.from(this.byTenant.get(tenantId) ?? []);
    return ok(ids.map((scenarioId) => this.toSummary(this.records.get(scenarioId)!)).filter(Boolean));
  }

  async listLatest(limit: number): Promise<Result<readonly StoredScenarioSummary[], Error>> {
    const ordered = Array.from(this.records.values())
      .filter((record): record is StoredScenarioRecord => Boolean(record))
      .sort((left, right) => right.createdAtUtc.localeCompare(left.createdAtUtc))
      .slice(0, limit);

    return ok(ordered.map((record) => this.toSummary(record)));
  }

  async archive(scenarioId: ScenarioId): Promise<Result<void, Error>> {
    const record = this.records.get(scenarioId);
    if (!record) return fail(new Error(`not-found:${scenarioId}`));

    this.records.set(scenarioId, {
      ...record,
      payload: {
        ...record.payload,
        windowState: 'canceled',
      },
      archivedAtUtc: new Date().toISOString(),
    });
    return ok(undefined);
  }

  private toSummary(record: StoredScenarioRecord): StoredScenarioSummary {
    return {
      scenarioId: record.scenarioId,
      tenantId: record.tenantId,
      title: `${record.scenarioId} at ${record.createdAtUtc}`,
      status: record.payload.windowState,
      createdAtUtc: record.createdAtUtc,
      tags: [record.payload.scenarioId, record.planId],
    };
  }
}

export interface ScenarioIndex {
  [tenantId: string]: ReadonlyArray<StoredScenarioRecord>;
}

export const summarizeTenants = (records: readonly StoredScenarioRecord[]): readonly ScenarioStoreSnapshot[] => {
  const groups = new Map<string, ScenarioStoreSnapshot & { activeCount: number; canceledCount: number }>();

  for (const record of records) {
    const existing = groups.get(record.tenantId);
    const status = record.payload.windowState;
    if (!existing) {
      groups.set(record.tenantId, {
        tenantId: record.tenantId,
        count: 0,
        active: 0,
        canceled: 0,
        newestScenarioId: undefined,
        activeCount: 0,
        canceledCount: 0,
      });
    }

    const next = groups.get(record.tenantId);
    if (!next) continue;
    next.count += 1;
    if (status === 'completed' || status === 'executing') next.activeCount += 1;
    if (status === 'canceled') next.canceledCount += 1;

    if (!next.newestScenarioId || record.createdAtUtc > records.find((item) => item.scenarioId === next.newestScenarioId)?.createdAtUtc!) {
      next.newestScenarioId = record.scenarioId;
    }
  }

  return Array.from(groups.values()).map((entry) => ({
    tenantId: entry.tenantId as TenantId,
    count: entry.count,
    active: entry.activeCount,
    canceled: entry.canceledCount,
    newestScenarioId: entry.newestScenarioId,
  }));
};

export const extractPlanIndex = (
  records: readonly StoredScenarioRecord[],
): Record<string, ReadonlySet<string>> => {
  const result: Record<string, Set<string>> = {};

  for (const record of records) {
    const tenantPlans = result[record.tenantId] ??= new Set();
    tenantPlans.add(record.planId);
  }

  return Object.fromEntries(Object.entries(result).map(([tenantId, planSet]) => [tenantId, planSet]));
};
