import { ok, err } from '@shared/result';
import { withBrand, type ResultState } from '@shared/core';
import { filterRecords, sortByDate, makeCursor, takePage } from './query';
import type {
  ExperimentRecord,
  ExperimentRepository,
  ExperimentRecordFilter,
  ExperimentRecordStatus,
  ExperimentRecordCursor,
  ExperimentRunId,
} from './types';
import { createRecordId, createRecordVersion, parseRecordVersion, createStatusCounts } from './types';

class SnapshotReader implements Iterable<ExperimentRecord>, AsyncDisposable {
  readonly #rows: readonly ExperimentRecord[];

  readonly #cursor: ExperimentRecordCursor;
  constructor(rows: readonly ExperimentRecord[]) {
    this.#rows = rows;
    this.#cursor = withBrand(`cursor:${Date.now()}`, 'ExperimentRecordCursor');
  }

  [Symbol.iterator](): Iterator<ExperimentRecord> {
    return this.#rows[Symbol.iterator]();
  }

  [Symbol.dispose](): void {
    return void this[Symbol.asyncDispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }

  getMeta(): { readonly cursor: ExperimentRecordCursor; readonly createdAt: string } {
    return {
      cursor: this.#cursor,
      createdAt: new Date().toISOString(),
    };
  }
}

export class InMemoryAutonomyExperimentStore implements ExperimentRepository {
  readonly #records = new Map<string, ExperimentRecord>();
  #disposed = false;

  async upsert(record: ExperimentRecord): Promise<ResultState<ExperimentRecord, Error>> {
    if (this.#disposed) {
      return err(new Error('store disposed'));
    }

    const previous = this.#records.get(record.recordId);
    const nextVersion = (previous ? parseRecordVersion(previous.version) : 0) + 1;
    const hydrated: ExperimentRecord = {
      ...record,
      recordId: createRecordId(record.runId),
      version: createRecordVersion(nextVersion),
      updatedAt: new Date().toISOString(),
    };

    this.#records.set(hydrated.recordId, hydrated);
    return ok(hydrated);
  }

  async hydrateRun(runId: ExperimentRunId): Promise<ExperimentRecord | undefined> {
    return [...this.#records.values()].find((record) => record.runId === runId);
  }

  async *query(filter: ExperimentRecordFilter): AsyncGenerator<ExperimentRecord> {
    const ordered = sortByDate(filterRecords([...this.#records.values()], filter));
    for (const row of ordered) {
      yield row;
    }
  }

  async paginate(filter: ExperimentRecordFilter, cursor?: ExperimentRecordCursor): Promise<{ items: ExperimentRecord[]; cursor: string; total: number }> {
    const records = sortByDate(filterRecords([...this.#records.values()], filter));
    const pageSize = 50;
    const entries = takePage(records, cursor);
    const next = entries.slice(pageSize);
    const nextCursor = next.length ? makeCursor(entries[pageSize]?.runId ?? ('' as ExperimentRunId), pageSize) : '';

    return {
      items: entries.slice(0, pageSize),
      cursor: nextCursor,
      total: records.length,
    };
  }

  async remove(runId: ExperimentRunId): Promise<void> {
    for (const [recordId, record] of this.#records.entries()) {
      if (record.runId === runId) {
        this.#records.delete(recordId);
      }
    }
  }

  telemetry(): { recordCount: number; statusCounts: Record<ExperimentRecordStatus, number>; lastMutationAt: string } {
    const statusCounts = createStatusCounts();
    let lastMutationAt = new Date(0).toISOString();
    for (const record of this.#records.values()) {
      statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
      if (record.updatedAt > lastMutationAt) {
        lastMutationAt = record.updatedAt;
      }
    }

    return {
      recordCount: this.#records.size,
      statusCounts,
      lastMutationAt,
    };
  }

  snapshot(filter: ExperimentRecordFilter): SnapshotReader {
    return new SnapshotReader(sortByDate(filterRecords([...this.#records.values()], filter)));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#records.clear();
  }

  [Symbol.dispose](): void {
    void this[Symbol.asyncDispose]();
  }
}

export const createStore = (): ExperimentRepository => new InMemoryAutonomyExperimentStore();
