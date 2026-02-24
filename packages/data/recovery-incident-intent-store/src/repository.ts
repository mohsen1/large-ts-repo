import { ok, fail, type Result } from '@shared/result';
import {
  createIntentStepId,
  createIncidentTenantId,
  createIntentRunId,
  type IncidentIntentRecord,
  type IncidentIntentPolicy,
  type IncidentIntentSignal,
  type IncidentContext,
} from '@domain/recovery-incident-intent';
import type {
  StoredIntentRecord,
  StoredIntentQuery,
  IntentStoreFilter,
  StoredIntentCommand,
  StoredIntentSnapshot,
  IncidentTenantId,
} from './models';
import { createStoredRecord, toSnapshot, mapPolicies } from './models';
import { serializeRecord, deserializeRecord, type IntentWire } from './serializers';

interface AsyncStackLike {
  use<T>(value: T): T;
  [Symbol.asyncDispose](): Promise<void>;
}

interface AsyncDisposableStackConstructor {
  new (): AsyncStackLike;
}

const globalAsyncStackCtor = (): AsyncDisposableStackConstructor => {
  const candidate = (globalThis as { AsyncDisposableStack?: AsyncDisposableStackConstructor }).AsyncDisposableStack;
  if (candidate) return candidate;

  return class FallbackAsyncDisposableStack implements AsyncStackLike {
    readonly #disposers: Array<() => PromiseLike<void> | void> = [];

    use<T>(value: T): T {
      this.#disposers.push(async () => {
        const asDisposable = value as Partial<{ [Symbol.asyncDispose]: () => PromiseLike<void> | void }>;
        await asDisposable[Symbol.asyncDispose]?.();
      });
      return value;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        await Promise.resolve(this.#disposers[index]?.());
      }
      this.#disposers.length = 0;
    }
  };
};

const AsyncDisposableStackCtor = globalAsyncStackCtor();

export interface IntentRecordQuery {
  readonly tenantId?: string;
  readonly query?: string;
  readonly limit?: number;
}

const sanitizeQuery = (query: StoredIntentQuery): string => (query.titleContains ? query.titleContains.toLowerCase() : '');

export class RecoveryIntentRecordRepository {
  readonly #records = new Map<string, IntentWire>();

  async save(command: StoredIntentCommand): Promise<Result<StoredIntentRecord, Error>> {
    const id = `${command.tenantId}:${command.manifest.catalogId}`;
    const record = createStoredRecord({
      tenantId: command.tenantId,
      manifest: command.manifest,
    });

    const wire = serializeRecord(record, command.signals);
    this.#records.set(id, wire);
    return ok(deserializeRecord(wire));
  }

  async lookupById(id: string): Promise<Result<StoredIntentRecord | null, Error>> {
    const wire = this.#records.get(id);
    if (!wire) return ok(null);
    return ok(deserializeRecord(wire));
  }

  async find(
    tenantId: IncidentTenantId,
    policy?: string,
    query?: string,
    filter: IntentStoreFilter = {
      tenantId,
      includeSignals: true,
      includePolicies: true,
      pageSize: 20,
      pageIndex: 0,
    },
  ): Promise<Result<readonly StoredIntentRecord[], Error>> {
    const rows = [...this.#records.values()]
      .map((wire) => deserializeRecord(wire))
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => (policy ? record.manifest.context.tags.includes(policy) : true))
      .filter((record) => {
        if (!query) return true;
        return record.manifest.title.toLowerCase().includes(query.toLowerCase());
      });

    const skip = filter.pageIndex * filter.pageSize;
    const take = filter.pageSize;
    return ok(rows.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(skip, skip + take));
  }

  async writeSignalBatch(
    tenantId: string,
    signals: readonly IncidentIntentSignal[],
    policies: readonly IncidentIntentPolicy[],
    manifest: IncidentIntentRecord,
    context: IncidentContext,
  ): Promise<Result<StoredIntentRecord, Error>> {
    const command: StoredIntentCommand = {
      tenantId: createIncidentTenantId(tenantId),
      manifest,
      signals: [...signals],
      policies,
      context,
    };
    return this.save(command);
  }

  async removeBefore(olderThan: string): Promise<Result<number, Error>> {
    const cutoff = new Date(olderThan).getTime();
    const keys = [...this.#records.keys()];
    let removed = 0;

    for (const key of keys) {
      const wire = this.#records.get(key);
      if (!wire) continue;
      const metadata = wire.metadata ?? {};
      const createdAtValue = typeof metadata.createdAt === 'string' ? metadata.createdAt : wire.manifest.createdAt;
      const createdAt = new Date(createdAtValue).getTime();
      if (createdAt < cutoff) {
        this.#records.delete(key);
        removed += 1;
      }
    }

    return ok(removed);
  }

  async snapshots(tenantId: IncidentTenantId): Promise<Result<readonly StoredIntentSnapshot[], Error>> {
    const rows = await this.find(tenantId);
    if (!rows.ok) return fail(rows.error);
    return ok(rows.value.map(toSnapshot));
  }

  async query(query: StoredIntentQuery = {}): Promise<Result<readonly StoredIntentRecord[], Error>> {
    const tenantId = query.tenantId;
    const rows = [...this.#records.values()]
      .map((wire) => deserializeRecord(wire))
      .filter((record) => (tenantId ? record.tenantId === tenantId : true))
      .filter((record) => {
        if (!query.manifestIds || query.manifestIds.length === 0) return true;
        return query.manifestIds.includes(record.manifest.catalogId);
      })
      .filter((record) => {
        if (!query.titleContains) return true;
        return record.manifest.title.toLowerCase().includes(query.titleContains.toLowerCase());
      })
      .filter((record) => {
        if (!query.since) return true;
        return new Date(record.createdAt).getTime() >= new Date(query.since).getTime();
      });
    return ok(rows.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }
}

export class IntentStoreHandle {
  readonly #repo = new RecoveryIntentRecordRepository();

  async withResource(work: (repo: RecoveryIntentRecordRepository) => Promise<void>): Promise<Result<void, Error>> {
    try {
      await using scope = new AsyncDisposableStackCtor();
      scope.use(this.#repo);
      await work(this.#repo);
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async writeSignalBatch(
    tenantId: string,
    signals: readonly IncidentIntentSignal[],
    policies: readonly IncidentIntentPolicy[],
    manifest: IncidentIntentRecord,
    context: IncidentContext,
  ): Promise<Result<StoredIntentRecord, Error>> {
    const record = {
      tenantId: createIncidentTenantId(tenantId),
      manifest,
      signals,
      policies,
      context,
    } as StoredIntentCommand;
    return this.#repo.save(record);
  }

  async readSignalsSnapshot(tenantId: string): Promise<Result<Readonly<Record<string, IncidentIntentPolicy>>, Error>> {
    const result = await this.#repo.find(createIncidentTenantId(tenantId));
    if (!result.ok) return fail(result.error);
    const records = result.value;
    const policies = records.reduce((acc, record) => {
      const next = mapPolicies(record.manifest.context.tags.map((tag) => ({
        policyId: createIntentStepId(tag, record.manifest.catalogId.length) as unknown as unknown as any,
        title: `${tag}:policy`,
        minimumConfidence: 0.5,
        weight: { severity: 1, freshness: 1, confidence: 1, cost: -1 },
        tags: [tag],
      })));
      return { ...acc, ...next };
    }, {} as Record<string, IncidentIntentPolicy>);
    return ok(policies);
  }

  async clearAll(olderThan: string): Promise<Result<number, Error>> {
    return this.#repo.removeBefore(olderThan);
  }

  async runbookId(): Promise<string> {
    return `run-${createIntentRunId('intent-store').slice(0, 8)}`;
  }
}

export const createStoreHandle = (): IntentStoreHandle => new IntentStoreHandle();

export const queryByWindow = async (
  repo: RecoveryIntentRecordRepository,
  tenantId: string,
  since: string,
): Promise<Result<readonly StoredIntentRecord[], Error>> => repo
  .find(createIncidentTenantId(tenantId), undefined, undefined, {
    tenantId: createIncidentTenantId(tenantId),
    includeSignals: true,
    includePolicies: true,
    pageSize: 40,
    pageIndex: 0,
  })
  .then((value) => {
    if (!value.ok) return value;
    const filtered = value.value.filter((record) => new Date(record.createdAt) >= new Date(since));
    return ok(filtered);
  });
