import { fail, ok, type Result } from '@shared/result';
import { groupBy } from '@shared/util';
import { type ConstellationPlanEnvelope, type ConstellationMode, type ConstellationRunId } from '@domain/recovery-cockpit-constellation-core';
import { planToTopology } from './query';
import {
  type ConstellationRunQuery,
  type ConstellationStoreRecord,
  type ConstellationRunSnapshot,
  type StoreAuditTrail,
  type StoreAuditAction,
  normalizeStoreQuery,
} from './types';
import { toTimestamp } from '@domain/recovery-cockpit-models';

type AuditEvent = {
  readonly runId: ConstellationRunId;
  readonly event: StoreAuditTrail;
};

type AsyncDisposableContract = {
  use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T;
  [Symbol.asyncDispose](): PromiseLike<void>;
};

const getAsyncStack = (): new () => AsyncDisposableContract => {
  const fallback = class FallbackAsyncDisposableStack {
    readonly #stack: Array<() => Promise<void>> = [];
    use<T>(value: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T {
      const disposer = value?.[Symbol.asyncDispose];
      if (typeof disposer === 'function') {
        this.#stack.push(() => Promise.resolve(disposer.call(value)));
      }
      return value;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#stack.length > 0) {
        const pop = this.#stack.pop();
        if (pop) {
          await pop();
        }
      }
    }
  };

  return (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableContract }).AsyncDisposableStack ?? fallback;
};

const buildStoreRecord = <T>(key: string, value: T): ConstellationStoreRecord<T> => ({
  key,
  value,
  version: 1,
  updatedAt: toTimestamp(new Date()),
  tags: [key.split(':')[0] ?? 'constellation'],
});

const buildAuditEvent = (runId: ConstellationRunId, action: StoreAuditAction, correlationId: string): StoreAuditTrail => ({
  at: toTimestamp(new Date()),
  action,
  correlationId,
  details: `${action}:${runId}`,
});

export interface ConstellationStore {
  upsert(
    runId: ConstellationRunId,
    plan: ConstellationPlanEnvelope['plan'],
    envelope: ConstellationPlanEnvelope,
    mode: ConstellationMode,
  ): Promise<Result<ConstellationRunSnapshot, string>>;
  get(runId: ConstellationRunId): Promise<Result<ConstellationRunSnapshot | undefined, string>>;
  list(query?: ConstellationRunQuery): Promise<Result<readonly ConstellationRunSnapshot[], string>>;
  appendEvent(runId: ConstellationRunId, event: StoreAuditTrail): Promise<Result<ConstellationRunSnapshot, string>>;
  stream(query?: ConstellationRunQuery): AsyncGenerator<ConstellationRunSnapshot>;
}

export class InMemoryConstellationRunStore implements ConstellationStore, AsyncDisposable {
  readonly #runs = new Map<string, ConstellationRunSnapshot>();
  readonly #records = new Map<string, ConstellationStoreRecord<ConstellationRunSnapshot>>();
  readonly #events: AuditEvent[] = [];
  readonly #stack = new (getAsyncStack())();

  async upsert(
    runId: ConstellationRunId,
    plan: ConstellationPlanEnvelope['plan'],
    envelope: ConstellationPlanEnvelope,
    mode: ConstellationMode,
  ): Promise<Result<ConstellationRunSnapshot, string>> {
    const now = toTimestamp(new Date());
    const existing = this.#runs.get(runId);
    const snapshot: ConstellationRunSnapshot = {
      runId,
      planId: plan.planId,
      mode,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      plan,
      topologyNodes: planToTopology(plan).nodes,
      planEnvelope: envelope,
      templateId: envelope.id,
      audit: [...(existing?.audit ?? []), buildAuditEvent(runId, existing ? 'update' : 'create', runId)],
      metadata: {
        source: existing ? 'mutation:update' : 'mutation:create',
      },
    };

    const record = existing
      ? {
          ...buildStoreRecord(runId, snapshot),
          version: (this.#records.get(runId)?.version ?? 0) + 1,
          updatedAt: now,
        }
      : buildStoreRecord(runId, snapshot);
    this.#runs.set(runId, snapshot);
    this.#records.set(runId, record);
    this.#events.push({
      runId,
      event: buildAuditEvent(runId, existing ? 'update' : 'create', runId),
    });
    return ok(snapshot);
  }

  async get(runId: ConstellationRunId): Promise<Result<ConstellationRunSnapshot | undefined, string>> {
    return ok(this.#runs.get(runId));
  }

  async list(query: ConstellationRunQuery = {}): Promise<Result<readonly ConstellationRunSnapshot[], string>> {
    const normalized = normalizeStoreQuery(query);
    const rows = [...this.#runs.values()].filter((snapshot) => {
      if (normalized.planId && snapshot.planId !== normalized.planId) {
        return false;
      }
      if (normalized.mode && snapshot.mode !== normalized.mode) {
        return false;
      }
      if (normalized.runIds?.length) {
        return normalized.runIds.includes(snapshot.runId);
      }
      return true;
    });
    return ok(rows.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }

  async appendEvent(
    runId: ConstellationRunId,
    event: StoreAuditTrail,
  ): Promise<Result<ConstellationRunSnapshot, string>> {
    const snapshot = this.#runs.get(runId);
    if (!snapshot) {
      return fail(`run ${runId} not found`);
    }
    const next = {
      ...snapshot,
      updatedAt: toTimestamp(new Date()),
      audit: [...snapshot.audit, event],
    };
    this.#runs.set(runId, next);
    this.#events.push({ runId, event: buildAuditEvent(runId, 'append', event.correlationId) });
    return ok(next);
  }

  async *stream(query: ConstellationRunQuery = {}): AsyncGenerator<ConstellationRunSnapshot> {
    const rows = await this.list(query);
    if (!rows.ok) return;
    for (const row of rows.value) {
      yield row;
    }
  }

  async summarizeByMode(): Promise<Result<Record<ConstellationMode, number>, string>> {
    const rows = await this.list();
    if (!rows.ok) return fail(rows.error);
    const grouped = groupBy(rows.value, (snapshot) => snapshot.mode);
    const summary = grouped.reduce<Record<ConstellationMode, number>>((acc, group) => {
      acc[group.key as ConstellationMode] = group.values.length;
      return acc;
    }, {
      analysis: 0,
      simulation: 0,
      execution: 0,
      stabilization: 0,
    });
    return ok(summary);
  }

  snapshotAudit(runId: ConstellationRunId): readonly StoreAuditTrail[] {
    return this.#events
      .filter((entry) => entry.runId === runId)
      .map((entry) => entry.event)
      .toSorted((left, right) => right.at.localeCompare(left.at));
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve(this.#stack[Symbol.asyncDispose]());
  }

  [Symbol.dispose](): void {
    void this[Symbol.asyncDispose]();
  }
}

export const createRunStore = async (): Promise<InMemoryConstellationRunStore> => {
  await Promise.resolve();
  return new InMemoryConstellationRunStore();
};
