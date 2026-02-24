import { z } from 'zod';
import { type LatticeRunId, type LatticeTenantId } from '@domain/recovery-lattice';
import { NoInfer, Optionalize } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type {
  LatticeStoreEvent,
  LatticeStoreId,
  LatticeStoreOptions,
  LatticeStoreQuery,
  LatticeStoreResult,
  LatticeStorePage,
  LatticeStoreCursor,
  LatticeSnapshotRecord,
} from './types';

export const snapshotRecordSchema = z.object({
  id: z.string().min(1),
  routeId: z.string().min(1),
  tenantId: z.string().min(1),
  context: z.object({
    tenantId: z.string(),
    regionId: z.string(),
    zoneId: z.string(),
    requestId: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
  events: z.array(
    z.object({
      id: z.string(),
      runId: z.string(),
      tenantId: z.string(),
      at: z.string(),
      kind: z.union([z.literal('snapshot'), z.literal('artifact'), z.literal('plan'), z.literal('error')]),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
});

const clone = <T>(value: T): T => structuredClone(value);

type QueryRecord = {
  readonly tenantId: string;
  readonly routeId: string;
  readonly updatedAt: string;
  readonly events: readonly { kind: string; at: string }[];
};

const matchesQuery = <TRecord extends QueryRecord>(record: TRecord, query: LatticeStoreQuery): boolean => {
  if (query.tenantId && record.tenantId !== query.tenantId) {
    return false;
  }
  if (query.routeId && record.routeId !== query.routeId) {
    return false;
  }
  if (query.eventKind) {
    const matchingKind = record.events.some((event) => event.kind === query.eventKind);
    if (!matchingKind) {
      return false;
    }
  }

  const updatedAt = new Date(record.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) {
    return false;
  }
  if (query.fromDate) {
    const from = new Date(query.fromDate).getTime();
    if (Number.isNaN(from) || updatedAt < from) {
      return false;
    }
  }
  if (query.toDate) {
    const to = new Date(query.toDate).getTime();
    if (Number.isNaN(to) || updatedAt > to) {
      return false;
    }
  }

  return true;
};

type AsyncDisposal = { [Symbol.asyncDispose](): Promise<void> };

const asyncStackFactory = (): {
  new (): {
    use<T extends object>(resource: T & AsyncDisposal): T;
    [Symbol.asyncDispose](): Promise<void>;
  };
} => {
  const fallback = class {
    readonly #disposers = new Set<() => Promise<void>>();

    use<T extends object>(resource: T & AsyncDisposal): T {
      const asyncDispose = resource?.[Symbol.asyncDispose];
      if (typeof asyncDispose === 'function') {
        this.#disposers.add(() => asyncDispose.call(resource));
      }
      return resource;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (const dispose of [...this.#disposers]) {
        await dispose();
      }
      this.#disposers.clear();
    }
  };

  return (
    (globalThis as { AsyncDisposableStack?: { new (): {
      use<T extends object>(resource: T & AsyncDisposal): T;
      [Symbol.asyncDispose](): Promise<void>;
    } } }).AsyncDisposableStack ?? fallback
  );
};

export class RecoveryLatticeRepository implements AsyncDisposal {
  readonly #records = new Map<string, LatticeSnapshotRecord>();
  readonly #ordered: LatticeStoreCursor[] = [];
  readonly #tenantIndex = new Map<LatticeTenantId, Set<string>>();
  readonly #options: LatticeStoreOptions;

  constructor(options: Partial<LatticeStoreOptions> = {}) {
    this.#options = {
      namespace: options.namespace ?? 'recovery-lattice',
      maxEventsPerRecord: options.maxEventsPerRecord ?? 64,
      maxRecordsPerTenant: options.maxRecordsPerTenant ?? 250,
    };
  }

  private byTenantKey(tenantId: LatticeTenantId, id: LatticeStoreId): string {
    return `${tenantId}:${id}`;
  }

  async upsert(record: LatticeSnapshotRecord): Promise<LatticeSnapshotRecord> {
    const key = this.byTenantKey(record.tenantId, record.id);
    const prior = this.#records.get(key);

    const merged: LatticeSnapshotRecord = prior
      ? {
          ...prior,
          ...record,
          updatedAt: new Date().toISOString(),
          events: [...prior.events, ...record.events].slice(-this.#options.maxEventsPerRecord),
        }
      : {
          ...record,
          createdAt: record.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          events: record.events.slice(-this.#options.maxEventsPerRecord),
        };

    const hydrated = {
      ...merged,
      routeId: merged.routeId,
      tenantId: merged.tenantId,
      id: merged.id,
      context: { ...merged.context },
      payload: clone(merged.payload),
      tags: [...merged.tags],
      events: [...merged.events],
    } as LatticeSnapshotRecord;

    this.#records.set(key, hydrated);
    this.#ordered.push({ id: hydrated.id, at: hydrated.updatedAt });
    this.#ordered.sort((left, right) => right.at.localeCompare(left.at));

    const tenantSet = this.#tenantIndex.get(merged.tenantId) ?? new Set<string>();
    tenantSet.add(key);
    this.#tenantIndex.set(merged.tenantId, tenantSet);

    if (tenantSet.size > this.#options.maxRecordsPerTenant) {
      const trim = [...tenantSet.values()].slice(0, tenantSet.size - this.#options.maxRecordsPerTenant);
      for (const candidate of trim) {
        this.#records.delete(candidate);
        tenantSet.delete(candidate);
      }
    }

    return clone(hydrated);
  }

  async appendEvent(
    tenantId: LatticeTenantId,
    runId: LatticeRunId,
    recordId: LatticeStoreId,
    event: Omit<LatticeStoreEvent, 'id' | 'tenantId' | 'at' | 'runId'> &
      Partial<Pick<LatticeStoreEvent, 'id' | 'at' | 'runId'>>,
  ): Promise<LatticeStoreEvent> {
    const key = this.byTenantKey(tenantId, recordId);
    const existing = this.#records.get(key);
    if (!existing) {
      throw new Error(`record-missing:${key}`);
    }

    const nextEvent: LatticeStoreEvent = {
      id: event.id
        ? event.id as LatticeStoreEvent['id']
        : withBrand(`${existing.id}::${runId}::${Date.now().toString(36)}`, 'lattice-store-event'),
      runId,
      tenantId,
      at: event.at ?? new Date().toISOString(),
      kind: event.kind ?? 'snapshot',
      payload: event.payload ?? {},
    };

    const updated: LatticeSnapshotRecord = {
      ...existing,
      events: [...existing.events, nextEvent].slice(-this.#options.maxEventsPerRecord),
      updatedAt: new Date().toISOString(),
    };

    this.#records.set(key, updated);
    return clone(nextEvent);
  }

  async query(query: NoInfer<LatticeStoreQuery> = {}): Promise<LatticeStoreResult<LatticeSnapshotRecord>> {
    const all = [...this.#records.values()];
    const filtered = all.filter((record) => matchesQuery(record, query));
    const sorted = [...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return {
      total: sorted.length,
      records: sorted.map((record) => clone(record)),
      next: sorted[0] ? { id: sorted[0].id, at: sorted[0].updatedAt } : undefined,
    };
  }

  async findByTenant(tenantId: LatticeTenantId): Promise<LatticeStorePage<LatticeSnapshotRecord>> {
    const indexed = this.#tenantIndex.get(tenantId) ?? new Set<string>();
    const records = [...indexed]
      .map((key) => this.#records.get(key))
      .filter((record): record is LatticeSnapshotRecord => Boolean(record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return {
      items: records.map((record) => clone(record)),
      total: records.length,
      hasMore: false,
      cursor: records[0]
        ? {
            id: records[0].id,
            at: records[0].updatedAt,
          }
        : undefined,
    };
  }

  async findByCursor(cursor: LatticeStoreCursor): Promise<readonly LatticeSnapshotRecord[]> {
    const index = this.#ordered.findIndex((entry) => entry.id === cursor.id && entry.at === cursor.at);
    const next = this.#ordered.slice(Math.max(0, index), index + 1 + this.#options.maxEventsPerRecord);
    const records = next
      .map((item) => [...this.#records.values()].find((record) => record.id === item.id))
      .filter((record): record is LatticeSnapshotRecord => Boolean(record));

    return records.map((record) => clone(record));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const AsyncDisposableStack = asyncStackFactory();
    await using stack = new AsyncDisposableStack();
    const resource = {
      [Symbol.asyncDispose]: () => {
        this.#records.clear();
        this.#ordered.length = 0;
        this.#tenantIndex.clear();
        return Promise.resolve();
      },
    };
    stack.use(resource);
  }
}

export const withRepository = async <
  TState,
>(
  options: Partial<LatticeStoreOptions>,
  handler: (repository: RecoveryLatticeRepository) => Promise<TState>,
): Promise<TState> => {
  const AsyncDisposableStack = asyncStackFactory();
  await using stack = new AsyncDisposableStack();
  const repository = new RecoveryLatticeRepository(options);
  stack.use(repository);
  return handler(repository);
};

export const recordProjection = <
  TRecord extends LatticeSnapshotRecord,
  K extends keyof TRecord & string,
>(
  record: TRecord,
  keys: readonly K[],
): Readonly<{ [P in K]: TRecord[P] }> => {
  const output = {} as { [P in K]: TRecord[P] };
  for (const key of keys) {
    output[key] = record[key];
  }
  return output;
};

export const hydrate = (record: unknown): LatticeSnapshotRecord => {
  const parsed = snapshotRecordSchema.parse(record);
  return {
    ...parsed,
    events: parsed.events.map((event) => ({
      id: withBrand(event.id, 'lattice-store-event'),
      runId: withBrand(event.runId, 'lattice-run:id'),
      tenantId: withBrand(event.tenantId, 'lattice-tenant:id'),
      at: event.at,
      kind: event.kind,
      payload: event.payload,
    })),
    routeId: withBrand(`route:${parsed.routeId}`, 'lattice-route:id'),
    tenantId: withBrand(parsed.tenantId, 'lattice-tenant:id'),
    id: withBrand(parsed.id, 'lattice-store-id'),
    context: {
      tenantId: withBrand(parsed.context.tenantId, 'lattice-tenant:id'),
      regionId: withBrand(parsed.context.regionId, 'lattice-region:id'),
      zoneId: withBrand(parsed.context.zoneId, 'lattice-zone:id'),
      requestId: withBrand(parsed.context.requestId, 'lattice-trace-id'),
    },
    payload: parsed.payload,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    tags: [...parsed.tags],
  };
};

export const projectByTag = (
  records: readonly LatticeSnapshotRecord[],
  tags: readonly string[],
): readonly LatticeSnapshotRecord[] => {
  const selected = new Set(tags);
  return records.filter((record) => record.tags.some((tag) => selected.has(tag)));
};

export type UnknownRecord = {
  readonly records: Map<string, LatticeSnapshotRecord>;
};

export interface LatticeStore extends Omit<RecoveryLatticeRepository, 'upsert' | 'appendEvent'> {}

export const optionalizeStore = <T>(value: T): Optionalize<T & Record<string, unknown>, never> =>
  value as Optionalize<T & Record<string, unknown>, never>;
