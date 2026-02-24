import { fail, ok, type Result } from '@shared/result';
import {
  asStoreEventId,
  asSyntheticPhase,
  asSyntheticRunId,
  asSyntheticRunRecordStatus,
  asSyntheticTenantId,
  asSyntheticWorkspaceId,
  type SyntheticRunRecord,
  type SyntheticRunEvent,
  type SyntheticRunSnapshot,
  type SyntheticStoreQuery,
  defaultStoreQuery,
} from './models';
import { buildEventPath, matchesTenant, paginateRunIds, summarizeFilters, eventMatches, type EventBucket, bucketByPhase } from './query';
import type { SyntheticRunId } from '@domain/recovery-synthetic-orchestration';

interface StoreState {
  readonly byRun: Map<string, SyntheticRunRecord>;
  readonly runEvents: Map<string, SyntheticRunEvent[]>;
  readonly snapshots: Map<string, SyntheticRunSnapshot[]>;
  readonly byTenant: Map<string, Set<string>>;
}

const createState = (): { runs: StoreState } => ({
  runs: {
    byRun: new Map<string, SyntheticRunRecord>(),
    runEvents: new Map<string, SyntheticRunEvent[]>(),
    snapshots: new Map<string, SyntheticRunSnapshot[]>(),
    byTenant: new Map<string, Set<string>>(),
  },
});

export interface SyntheticRunRepository {
  saveRun(record: SyntheticRunRecord): Promise<Result<SyntheticRunRecord, Error>>;
  upsertRun(record: SyntheticRunRecord): Promise<Result<SyntheticRunRecord, Error>>;
  getRun(runId: SyntheticRunId): Promise<Result<SyntheticRunRecord | undefined, Error>>;
  listRuns(query: SyntheticStoreQuery): Promise<Result<readonly SyntheticRunRecord[], Error>>;
  appendEvent(event: SyntheticRunEvent): Promise<Result<SyntheticRunEvent, Error>>;
  listEvents(runId: SyntheticRunId, query: SyntheticStoreQuery): Promise<Result<readonly SyntheticRunEvent[], Error>>;
  saveSnapshot(snapshot: SyntheticRunSnapshot): Promise<Result<SyntheticRunSnapshot, Error>>;
  listSnapshots(runId: SyntheticRunId): Promise<Result<readonly SyntheticRunSnapshot[], Error>>;
  appendSnapshot(record: SyntheticRunRecord): Promise<Result<SyntheticRunSnapshot, Error>>;
  summarize(runId: SyntheticRunId): Promise<Result<readonly EventBucket[], Error>>;
}

export class InMemorySyntheticRunStore implements SyntheticRunRepository {
  private readonly state = createState().runs;

  [Symbol.dispose](): void {
    this.state.byRun.clear();
    this.state.runEvents.clear();
    this.state.snapshots.clear();
    this.state.byTenant.clear();
  }

  async saveRun(record: SyntheticRunRecord): Promise<Result<SyntheticRunRecord, Error>> {
    try {
      const normalized = this.normalizeRecord(record);
      const tenantSet = this.state.byTenant.get(normalized.tenantId) ?? new Set<string>();
      tenantSet.add(normalized.runId);
      this.state.byTenant.set(normalized.tenantId, tenantSet);
      this.state.byRun.set(normalized.runId, normalized);
      return ok(normalized);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-save-run'));
    }
  }

  async upsertRun(record: SyntheticRunRecord): Promise<Result<SyntheticRunRecord, Error>> {
    return this.saveRun(record);
  }

  async getRun(runId: SyntheticRunId): Promise<Result<SyntheticRunRecord | undefined, Error>> {
    try {
      return ok(this.state.byRun.get(runId));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-get-run'));
    }
  }

  async listRuns(query: SyntheticStoreQuery): Promise<Result<readonly SyntheticRunRecord[], Error>> {
    try {
      const merged = { ...defaultStoreQuery, ...query } as SyntheticStoreQuery & { limit: number };
      const runIds = merged.tenantId
        ? [...(this.state.byTenant.get(merged.tenantId) ?? new Set<string>())]
        : [...this.state.byRun.keys()];

      const filteredRecords = runIds
        .map((runId) => this.state.byRun.get(runId))
        .filter((run): run is SyntheticRunRecord => Boolean(run))
        .filter((record) => matchesTenant(record, merged))
        .filter((record) => (merged.status ? record.status === merged.status : true))
        .sort((left, right) => {
          if (left.startedAt === right.startedAt) {
            return left.runId.localeCompare(right.runId);
          }
          return right.updatedAt.localeCompare(left.updatedAt);
        });

      const pageIds = paginateRunIds(
        filteredRecords.map((record) => record.runId),
        merged,
      );
      const output = pageIds
        .map((runId) => this.state.byRun.get(runId))
        .filter((record): record is SyntheticRunRecord => Boolean(record));
      void summarizeFilters;
      return ok(output);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-list-runs'));
    }
  }

  async appendEvent(event: SyntheticRunEvent): Promise<Result<SyntheticRunEvent, Error>> {
    try {
      const normalized = this.normalizeEvent(event);
      const bucket = this.state.runEvents.get(normalized.runId) ?? [];
      this.state.runEvents.set(normalized.runId, [...bucket, normalized]);
      return ok(normalized);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-append-event'));
    }
  }

  async listEvents(runId: SyntheticRunId, query: SyntheticStoreQuery): Promise<Result<readonly SyntheticRunEvent[], Error>> {
    try {
      const events = (this.state.runEvents.get(runId) ?? [])
        .filter((event) => eventMatches(event, query))
        .sort((left, right) => left.at.localeCompare(right.at));
      return ok(events);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-list-events'));
    }
  }

  async saveSnapshot(snapshot: SyntheticRunSnapshot): Promise<Result<SyntheticRunSnapshot, Error>> {
    try {
      const normalized = this.normalizeSnapshot(snapshot);
      const existing = this.state.snapshots.get(normalized.runId) ?? [];
      this.state.snapshots.set(normalized.runId, [...existing, normalized]);
      return ok(normalized);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-save-snapshot'));
    }
  }

  async listSnapshots(runId: SyntheticRunId): Promise<Result<readonly SyntheticRunSnapshot[], Error>> {
    try {
      const sorted = [...(this.state.snapshots.get(runId) ?? [])].sort((left, right) => right.at.localeCompare(left.at));
      return ok(sorted);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-list-snapshots'));
    }
  }

  async appendSnapshot(record: SyntheticRunRecord): Promise<Result<SyntheticRunSnapshot, Error>> {
    try {
      const snapshot: SyntheticRunSnapshot = {
        id: asStoreEventId(`${record.runId}:snapshot:${record.updatedAt}`),
        runId: record.runId,
        workspaceId: record.workspaceId,
        at: new Date().toISOString(),
        payload: {
          status: record.status,
          pluginCount: record.pluginCount,
          updatedAt: record.updatedAt,
          requestedBy: record.requestedBy,
        },
        phase: record.phases.at(0) ?? 'ingest',
      };
      return this.saveSnapshot(snapshot);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-append-snapshot'));
    }
  }

  async summarize(runId: SyntheticRunId): Promise<Result<readonly EventBucket[], Error>> {
    try {
      const events = await this.listEvents(runId, {});
      if (!events.ok) {
        return fail(events.error);
      }
      return ok(bucketByPhase(events.value));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('unable-to-summarize'));
    }
  }

  private normalizeRecord(record: SyntheticRunRecord): SyntheticRunRecord {
    return {
      ...record,
      runId: asSyntheticRunId(record.runId),
      tenantId: asSyntheticTenantId(record.tenantId),
      workspaceId: asSyntheticWorkspaceId(record.workspaceId),
      status: asSyntheticRunRecordStatus(record.status) ?? record.status,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };
  }

  private normalizeEvent(event: SyntheticRunEvent): SyntheticRunEvent {
    return {
      ...event,
      id: asStoreEventId(event.id ?? buildEventPath(event.runId, event.pluginId, event.phase)),
      runId: asSyntheticRunId(event.runId),
      tenantId: asSyntheticTenantId(event.tenantId),
      workspaceId: asSyntheticWorkspaceId(event.workspaceId),
      phase: asSyntheticPhase(event.phase),
      at: event.at || new Date().toISOString(),
      payload: event.payload ?? {},
    };
  }

  private normalizeSnapshot(snapshot: SyntheticRunSnapshot): SyntheticRunSnapshot {
    return {
      ...snapshot,
      id: asStoreEventId(snapshot.id || `${snapshot.runId}:snapshot:${snapshot.at}`),
      runId: asSyntheticRunId(snapshot.runId),
      workspaceId: asSyntheticWorkspaceId(snapshot.workspaceId),
      at: snapshot.at || new Date().toISOString(),
      phase: asSyntheticPhase(snapshot.phase),
      payload: snapshot.payload,
    };
  }
}

export const createRunId = (tenantId: string, workspaceId: string, suffix: string): SyntheticRunId =>
  asSyntheticRunId(`${tenantId}:${workspaceId}:${suffix}`);

export const createEventKey = (runId: SyntheticRunId, pluginId: string, phase: string): string =>
  buildEventPath(runId, pluginId as any, phase as any);

export const normalizeRunStatus = (value: string): ReturnType<typeof asSyntheticRunRecordStatus> => {
  return asSyntheticRunRecordStatus(value);
};

const isMatch = (record: SyntheticRunRecord, tenantId?: string, status?: string): boolean => {
  if (tenantId && record.tenantId !== tenantId) return false;
  if (status && record.status !== status) return false;
  return true;
};
