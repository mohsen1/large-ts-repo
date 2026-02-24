import { ok, fail, type Result } from '@shared/result';
import type { DigitalTwinRecord, TwinId, TwinRevision, TwinSnapshot, TwinWriteOptions, TwinQuery } from './types';
import { mergeMetrics, defaultTwinToken } from './types';
import type { Brand } from '@shared/type-level';

export interface TwinRecordStore {
  save(record: DigitalTwinRecord): Promise<Result<boolean, Error>>;
  delete(twinId: TwinId): Promise<Result<boolean, Error>>;
  list(query?: TwinQuery): Promise<Result<readonly TwinId[], Error>>;
  load(twinId: TwinId): Promise<Result<TwinSnapshot, Error>>;
  appendSnapshot(
    twinId: TwinId,
    snapshot: TwinSnapshot,
    options?: Partial<TwinWriteOptions>,
  ): Promise<Result<TwinRevision, Error>>;
}

const defaultOptions = {
  preserveWindowCount: 2,
  maxHistory: 100,
};

export class MemoryTwinRepository implements TwinRecordStore, AsyncDisposable {
  readonly #records = new Map<TwinId, DigitalTwinRecord>();
  readonly #snapshots = new Map<TwinId, TwinSnapshot[]>();

  public async save(record: DigitalTwinRecord): Promise<Result<boolean, Error>> {
    this.#records.set(record.id, record);
    if (!this.#snapshots.has(record.id)) {
      this.#snapshots.set(record.id, []);
    }
    return ok(true);
  }

  public async delete(twinId: TwinId): Promise<Result<boolean, Error>> {
    const deleted = this.#records.delete(twinId);
    this.#snapshots.delete(twinId);
    return ok(deleted);
  }

  public async load(twinId: TwinId): Promise<Result<TwinSnapshot, Error>> {
    const snapshots = this.#snapshots.get(twinId);
    if (!snapshots?.length) {
      return fail(new Error(`missing snapshot ${twinId}`));
    }
    return ok(snapshots[snapshots.length - 1]);
  }

  public async list(query: TwinQuery = {}): Promise<Result<readonly TwinId[], Error>> {
    const ids = [...this.#records.entries()]
      .filter(([_, value]) =>
        (!query.tenant || value.tenant === query.tenant) &&
        (!query.workspace || value.workspace === query.workspace) &&
        (!query.runId || value.runId === query.runId) &&
        (!query.status || query.status.includes(value.status)),
      )
      .map(([id]) => id);
    return ok(ids);
  }

  public async appendSnapshot(
    twinId: TwinId,
    snapshot: TwinSnapshot,
    options: Partial<TwinWriteOptions> = {},
  ): Promise<Result<TwinRevision, Error>> {
    const current = this.#snapshots.get(twinId);
    if (!current) {
      return fail(new Error(`missing twin ${twinId}`));
    }
    const safePreserve = Math.max(1, options.preserveWindowCount ?? defaultOptions.preserveWindowCount);
    const safeMax = Math.max(1, options.maxHistory ?? defaultOptions.maxHistory);

    const currentRecord = this.#records.get(twinId);
    if (!currentRecord) {
      return fail(new Error(`missing record ${twinId}`));
    }

    const nextRecord: DigitalTwinRecord = {
      ...currentRecord,
      metrics: mergeMetrics(currentRecord.metrics, snapshot.record.metrics),
    };
    this.#records.set(twinId, nextRecord);

    const history = [...current, snapshot]
      .filter((entry) => entry.windows.length >= safePreserve)
      .toSorted((left, right) => right.record.startedAt.localeCompare(left.record.startedAt))
      .slice(0, safeMax);
    this.#snapshots.set(twinId, history);

    const token = `${defaultTwinToken}:${Date.now()}` as Brand<string, 'TwinToken'>;
    const revision = {
      twinId,
      version: (history.length as Brand<number, 'TwinRevision'>),
      token,
    } satisfies TwinRevision;

    return ok(revision);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#records.clear();
    this.#snapshots.clear();
  }
}
