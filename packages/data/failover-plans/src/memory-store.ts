import { PlanId, PlanSnapshot } from '@domain/failover-orchestration';
import { ok, fail, Result } from '@shared/result';
import {
  SnapshotStoreError,
  SnapshotStorePort,
  SnapshotQuery,
  SnapshotPage,
  StoredSnapshot,
  SnapshotUpdate,
} from './types';

interface Entry {
  current: string;
  versions: string[];
  createdAt: string;
  updatedAt: string;
}

const toVersion = (planId: PlanId, version: number): string => `${planId}-snapshot-${version}`;

export class InMemoryFailoverPlanStore implements SnapshotStorePort {
  private readonly snapshots = new Map<string, Entry>();

  async save(planId: PlanId, payload: string): Promise<Result<StoredSnapshot, SnapshotStoreError>> {
    const now = new Date().toISOString();
    const existing = this.snapshots.get(planId);
    const versions = [...(existing?.versions ?? []), payload];

    this.snapshots.set(planId, {
      current: payload,
      versions,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return ok({
      id: toVersion(planId, versions.length),
      planId,
      snapshot: payload,
      createdAt: existing?.createdAt ?? now,
      version: versions.length,
    });
  }

  async get(planId: PlanId): Promise<Result<StoredSnapshot | undefined, SnapshotStoreError>> {
    const raw = this.snapshots.get(planId);
    if (!raw) {
      return ok(undefined);
    }

    return ok({
      id: toVersion(planId, raw.versions.length),
      planId,
      snapshot: raw.current,
      createdAt: raw.createdAt,
      version: raw.versions.length,
    });
  }

  async list(query: SnapshotQuery): Promise<Result<SnapshotPage, SnapshotStoreError>> {
    const entries = Array.from(this.snapshots.entries())
      .filter(([planId]) => (query.planId ? planId === query.planId : true))
      .filter(([planId]) => (query.tenantId ? planId.includes(query.tenantId) : true))
      .filter(([_, entry]) => {
        const updatedAt = Date.parse(entry.updatedAt);
        if (Number.isNaN(updatedAt)) return false;
        if (query.from && updatedAt < Date.parse(query.from)) return false;
        if (query.to && updatedAt > Date.parse(query.to)) return false;
        return true;
      })
      .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt));

    const limit = Math.max(1, Math.min(query.limit ?? 50, 500));
    const paged = entries.slice(0, limit);
    const items: StoredSnapshot[] = paged.map(([planId, entry]) => ({
      id: toVersion(planId as PlanId, entry.versions.length),
      planId: planId as PlanId,
      snapshot: entry.current,
      createdAt: entry.createdAt,
      version: entry.versions.length,
    }));

    return ok({
      items,
      nextCursor: items.length > 0 ? items[items.length - 1].id : undefined,
    });
  }

  async patch(planId: PlanId, patch: SnapshotUpdate): Promise<Result<StoredSnapshot, SnapshotStoreError>> {
    const existing = this.snapshots.get(planId);
    if (!existing) {
      return fail({
        kind: 'not-found',
        message: `plan snapshot missing: ${planId}`,
      });
    }

    if (patch.version !== existing.versions.length) {
      return fail({
        kind: 'conflict',
        message: `snapshot version mismatch for ${planId}`,
      });
    }

    const snapshot = parseSnapshot(existing.current);
    const next = { ...snapshot, ...patch, planId: planId } as PlanSnapshot;
    return this.save(planId, JSON.stringify(next));
  }

  async delete(planId: PlanId): Promise<Result<void, SnapshotStoreError>> {
    const existed = this.snapshots.delete(planId);
    if (!existed) {
      return fail({
        kind: 'not-found',
        message: `cannot delete unknown snapshot: ${planId}`,
      });
    }
    return ok(undefined);
  }
}

const parseSnapshot = (raw: string): PlanSnapshot => {
  return JSON.parse(raw) as PlanSnapshot;
};

export const snapshotPayload = (planId: PlanId, payload: PlanSnapshot): string => {
  return `${planId}::${JSON.stringify(payload)}`;
};

export const decodeSnapshotPayload = (raw: string): Result<PlanSnapshot, SnapshotStoreError> => {
  try {
    const parts = raw.split('::');
    return ok(JSON.parse(parts.slice(1).join('::')) as PlanSnapshot);
  } catch (error) {
    return fail({
      kind: 'io-error',
      message: (error as Error).message,
    });
  }
}

export const aggregateVersions = async (
  store: SnapshotStorePort,
  planId: PlanId,
): Promise<Result<number, SnapshotStoreError>> => {
  const current = await store.get(planId);
  if (!current.ok) return current;
  if (!current.value) return ok(0);
  const restored = decodeSnapshotPayload(current.value.snapshot);
  return restored.ok ? ok(current.value.version) : restored;
};
