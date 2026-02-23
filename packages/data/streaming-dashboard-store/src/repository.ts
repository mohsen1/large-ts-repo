import { ok, fail, Result } from '@shared/result';
import { EntitySpec, Repository } from '@data/repositories';
import { StreamHealthSignal } from '@domain/streaming-observability';
import { DashboardStreamSnapshot, DashboardQueryFilter, DashboardQueryResult, TenantSnapshotCursor } from './models';
import { streamSnapshotToView } from './adapters';

const spec: EntitySpec<string, DashboardStreamSnapshot> = {
  collection: 'dashboard-stream-snapshots',
  id: (entity) => entity.id,
};

interface InMemoryDashboardRecord {
  entity: DashboardStreamSnapshot;
  createdAt: number;
}

export class InMemoryStreamingDashboardRepository implements Repository<string, DashboardStreamSnapshot> {
  private readonly rows = new Map<string, InMemoryDashboardRecord>();

  constructor(private readonly options: { maxRows?: number } = {}) {}

  public async findById(id: string): Promise<DashboardStreamSnapshot | null> {
    const row = this.rows.get(id);
    return row ? row.entity : null;
  }

  public async save(entity: DashboardStreamSnapshot): Promise<void> {
    if (!spec.id(entity)) {
      throw new Error('invalid dashboard snapshot entity');
    }
    this.rows.set(entity.id, { entity, createdAt: Date.now() });
    this.enforceMaxRows();
  }

  public async deleteById(id: string): Promise<void> {
    this.rows.delete(id);
  }

  public async all(): Promise<DashboardStreamSnapshot[]> {
    return [...this.rows.values()].map((row) => row.entity);
  }

  public async query(filter: DashboardQueryFilter = {}): Promise<DashboardQueryResult> {
    const allSnapshots = await this.all();
    const result = allSnapshots.filter((snapshot: DashboardStreamSnapshot) => {
      if (filter.tenant && snapshot.tenant !== filter.tenant) return false;
      if (filter.streamId && snapshot.streamId !== filter.streamId) return false;
      if (filter.fromMs && Date.parse(snapshot.capturedAt) < filter.fromMs) return false;
      if (filter.toMs && Date.parse(snapshot.capturedAt) > filter.toMs) return false;
      if (filter.withCriticalSignalsOnly) {
        return snapshot.healthSignals.some((signal: StreamHealthSignal) => signal.level === 'critical');
      }
      return true;
    });
    return {
      total: result.length,
      snapshots: result,
    };
  }

  public async queryByCursor(cursor: TenantSnapshotCursor): Promise<DashboardQueryResult> {
    const allSnapshots = await this.all();
    const sorted = [...allSnapshots]
      .filter((snapshot) => snapshot.tenant === cursor.tenant)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

    const start = Number(cursor.cursor || 0);
    const page = sorted.slice(start, start + 100);
    return {
      total: sorted.length,
      snapshots: page,
    };
  }

  private enforceMaxRows(): void {
    const maxRows = this.options.maxRows ?? 5000;
    if (this.rows.size <= maxRows) return;
    const toDelete = this.rows.size - maxRows;
    const old = [...this.rows.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, toDelete)
      .map((row) => row[0]);
    for (const id of old) {
      this.rows.delete(id);
    }
  }
}

export const upsertSnapshot = async (
  repository: InMemoryStreamingDashboardRepository,
  snapshot: DashboardStreamSnapshot,
): Promise<Result<void>> => {
  try {
    await repository.save(snapshot);
    return ok(undefined);
  } catch (error) {
    return fail(error as Error);
  }
};

export const loadViewModel = (snapshot: DashboardStreamSnapshot) => streamSnapshotToView(snapshot);
