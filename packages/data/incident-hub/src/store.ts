import { Result, fail, ok } from '@shared/result';
import { IncidentRecord } from '@domain/incident-management';
import { IncidentSnapshot, StoreFilters } from './models';

export interface IncidentRepository {
  save(incident: IncidentRecord): Promise<Result<IncidentRecord>>;
  upsert(incident: IncidentRecord): Promise<Result<IncidentRecord>>;
  get(id: string): Promise<Result<IncidentRecord | undefined>>;
  list(filters: StoreFilters): Promise<Result<IncidentRecord[]>>;
  appendSnapshot(incident: IncidentRecord): Promise<Result<IncidentSnapshot>>;
  recent(tenantId: string, limit: number): Promise<Result<IncidentRecord[]>>;
}

interface StoreState {
  incidents: Map<string, IncidentRecord>;
  tenantIndex: Map<string, Set<string>>;
}

const makeStore = (): StoreState => ({
  incidents: new Map<string, IncidentRecord>(),
  tenantIndex: new Map<string, Set<string>>(),
});

const matches = (incident: IncidentRecord, filters: StoreFilters): boolean => {
  if (filters.tenantId && incident.tenantId !== filters.tenantId) return false;
  if (filters.serviceId && incident.serviceId !== filters.serviceId) return false;
  if (filters.state && incident.state !== filters.state) return false;

  const created = Date.parse(incident.createdAt);
  if (Number.isFinite(created)) {
    if (filters.from && created < Date.parse(filters.from)) return false;
    if (filters.to && created > Date.parse(filters.to)) return false;
  }

  return true;
};

const toPaged = (items: IncidentRecord[], limit = 50, cursor?: string): IncidentRecord[] => {
  const start = cursor ? Number(cursor.replace('cursor-', '')) : 0;
  if (!Number.isFinite(start) || start < 0) return items.slice(0, limit);
  return items.slice(start, start + limit);
};

export class InMemoryIncidentStore implements IncidentRepository {
  private readonly state = makeStore();

  async save(incident: IncidentRecord): Promise<Result<IncidentRecord>> {
    try {
      if (!incident.id) {
        return fail(new Error('incident.id is required'));
      }
      this.state.incidents.set(incident.id, incident);
      const bucket = this.state.tenantIndex.get(incident.tenantId) ?? new Set<string>();
      bucket.add(incident.id);
      this.state.tenantIndex.set(incident.tenantId, bucket);
      return ok(incident);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unknown save failure'));
    }
  }

  async upsert(incident: IncidentRecord): Promise<Result<IncidentRecord>> {
    return this.save({
      ...incident,
      updatedAt: new Date().toISOString(),
    });
  }

  async get(id: string): Promise<Result<IncidentRecord | undefined>> {
    try {
      return ok(this.state.incidents.get(id));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unknown get failure'));
    }
  }

  async list(filters: StoreFilters): Promise<Result<IncidentRecord[]>> {
    try {
      const ids = filters.tenantId ? (this.state.tenantIndex.get(filters.tenantId) ?? new Set<string>()) : this.state.incidents.keys();
      const all = [...ids]
        .map((id) => this.state.incidents.get(String(id)))
        .filter((incident): incident is IncidentRecord => Boolean(incident))
        .filter((incident) => matches(incident, filters));

      const sorted = all.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      const cursor = filters.cursor ? Number(String(filters.cursor).replace('cursor-', '')) : 0;
      const items = toPaged(sorted, filters.limit ?? 50, filters.cursor);
      return ok(items);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unknown list failure'));
    }
  }

  async appendSnapshot(incident: IncidentRecord): Promise<Result<import('./models').IncidentSnapshot>> {
    try {
      const snapshot = {
        id: `${incident.id}:snapshot:${incident.updatedAt}` as import('./models').IncidentSnapshotId,
        incident,
        snapshotAt: new Date().toISOString(),
      };
      return ok(snapshot);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unknown snapshot failure'));
    }
  }

  async recent(tenantId: string, limit: number): Promise<Result<IncidentRecord[]>> {
    const resolved = await this.list({ tenantId, limit });
    return resolved;
  }
}
