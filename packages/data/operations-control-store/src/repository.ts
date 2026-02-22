import { fail, ok, Result } from '@shared/result';
import { ControlRunRecord, RunFilters, StoreCursor, parseStoreCursor, encodeStoreCursor, ControlTimelinePoint } from './models';
import { QueryResult, clampLimit, buildCursor } from '@data/query-models';
import { ControlRunPlan } from '@domain/operations-control';

export interface ControlOperationsRepository {
  upsertRun<T extends Record<string, unknown>>(run: ControlRunRecord<T>): Promise<Result<void, Error>>;
  getRun(runId: string): Promise<Result<ControlRunRecord | undefined, Error>>;
  listRuns(filters: RunFilters, cursor?: string, limit?: number): Promise<Result<QueryResult<ControlRunRecord>, Error>>;
  appendTimeline(point: ControlTimelinePoint): Promise<Result<void, Error>>;
  timeline(runId: string): Promise<Result<ControlTimelinePoint[], Error>>;
}

interface State {
  readonly runs: Map<string, ControlRunRecord>;
  readonly timelineByRun: Map<string, ControlTimelinePoint[]>;
  readonly archived: Set<string>;
}

const newState = (): State => ({
  runs: new Map<string, ControlRunRecord>(),
  timelineByRun: new Map<string, ControlTimelinePoint[]>(),
  archived: new Set<string>(),
});

const matches = (record: ControlRunRecord, filters: RunFilters): boolean => {
  if (filters.tenantId && record.tenantId !== filters.tenantId) return false;
  if (filters.requestId && record.requestId !== filters.requestId) return false;
  if (filters.hasArchived !== undefined) {
    const archived = record.archivedAt !== undefined;
    if (filters.hasArchived !== archived) return false;
  }
  if (filters.from && Date.parse(record.observedAt) < Date.parse(filters.from)) return false;
  if (filters.to && Date.parse(record.observedAt) > Date.parse(filters.to)) return false;
  return true;
};

export class InMemoryControlOperationsRepository implements ControlOperationsRepository {
  private readonly state: State = newState();

  async upsertRun<T extends Record<string, unknown>>(run: ControlRunRecord<T>): Promise<Result<void, Error>> {
    try {
      this.state.runs.set(run.runId, run as ControlRunRecord);
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('run upsert failed'));
    }
  }

  async getRun(runId: string): Promise<Result<ControlRunRecord | undefined, Error>> {
    try {
      return ok(this.state.runs.get(runId));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('run get failed'));
    }
  }

  async listRuns(
    filters: RunFilters,
    cursor?: string,
    limit = 50,
  ): Promise<Result<QueryResult<ControlRunRecord>, Error>> {
    try {
      const parsedCursor: StoreCursor = parseStoreCursor(cursor);
      const all = [...this.state.runs.values()]
        .filter((run) => matches(run, filters))
        .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));

      const pageSize = clampLimit(limit);
      const start = parsedCursor.cursor === '0' ? 0 : Number.parseInt(parsedCursor.cursor, 10);
      const items = all.slice(start, start + pageSize);
      const hasMore = start + pageSize < all.length;
      const nextCursor = hasMore ? encodeStoreCursor(start + pageSize, pageSize) : undefined;
      return ok({
        cursor: nextCursor,
        items,
        hasMore,
      } as QueryResult<ControlRunRecord>);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('run list failed'));
    }
  }

  async appendTimeline(point: ControlTimelinePoint): Promise<Result<void, Error>> {
    try {
      const existing = this.state.timelineByRun.get(point.runId) ?? [];
      this.state.timelineByRun.set(point.runId, [...existing, point]);
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('timeline append failed'));
    }
  }

  async timeline(runId: string): Promise<Result<ControlTimelinePoint[], Error>> {
    try {
      return ok((this.state.timelineByRun.get(runId) ?? []).slice());
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('timeline query failed'));
    }
  }
}

export interface ArchiveManifest {
  runId: string;
  bucket: string;
  key: string;
}

export interface ArchiveService {
  archive(run: ControlRunRecord): Promise<Result<ArchiveManifest, Error>>;
  restore(runId: string): Promise<Result<ControlRunRecord | undefined, Error>>;
}

export const hydrateRun = <T extends Record<string, unknown>>(run: ControlRunPlan<T>): ControlRunPlan<T> => ({
  ...run,
  state: 'completed',
});
