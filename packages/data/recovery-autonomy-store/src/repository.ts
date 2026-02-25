import { ok, err, type Result } from '@shared/result';
import { Brand, withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import {
  AUTONOMY_SCOPE_SEQUENCE,
  type AutonomyGraphId,
  type AutonomyPlan,
  type AutonomyRunId,
  type AutonomyScope,
  type AutonomySignalEnvelope,
  type AutonomySignalInput,
  type AutonomyGraph,
} from '@domain/recovery-autonomy-graph';
import {
  AUTONOMY_STORE_LIMITS,
  type AutonomyRunRecord,
  type AutonomyStoreDefaults,
  type AutonomyStoreQuery,
  type AutonomyStorePage,
  type AutonomyRunRecordId,
  type AutonomyStoreSlot,
  type RunRecordEnvelope,
  loadStoreDefaults,
  makeRecordId,
  makeSlot,
  makeWindow,
} from './types';
import { uniqueBy } from './iterator';

export type RepositoryId = Brand<string, 'AutonomyRepositoryId'>;

export type AutonomyRunRecordCatalog = {
  readonly runId: AutonomyRunId;
  readonly records: readonly AutonomyRunRecord[];
};

type AuditMessage = {
  readonly scope: AutonomyScope;
  readonly messages: readonly string[];
};

const catalogToGraph = (
  runId: AutonomyRunId,
  graphId: AutonomyGraphId,
  plan: AutonomyPlan,
  signalObservedAt: string,
  expiresAtMs: number,
): AutonomyGraph => ({
  graphId,
  tenantId: plan.planId,
  runId,
  stages: plan.stages as AutonomyGraph['stages'],
  nodes: [],
  links: [],
  createdAt: signalObservedAt,
  expiresAt: new Date(expiresAtMs).toISOString(),
});

export class AutonomyRunStore {
  #records = new Map<string, Map<AutonomyScope, AutonomyRunRecord[]>>();
  #slots = new Map<string, AutonomyStoreSlot>();
  #disposed = false;
  #defaults: AutonomyStoreDefaults;

  constructor(defaults?: AutonomyStoreDefaults) {
    this.#defaults = defaults ?? AUTONOMY_STORE_LIMITS;
    for (const scope of AUTONOMY_SCOPE_SEQUENCE) {
      this.#slots.set(scope, makeSlot(scope));
    }
  }

  public static async create(defaults?: AutonomyStoreDefaults): Promise<AutonomyRunStore> {
    const resolved = defaults ?? (await loadStoreDefaults());
    return new AutonomyRunStore(resolved);
  }

  public async write(args: NoInfer<RunRecordEnvelope>): Promise<Result<AutonomyRunRecord>> {
    if (this.#disposed) {
      return err(new Error('store disposed'));
    }

    const runKey = String(args.runId);
    const byScope = this.#records.get(runKey) ?? new Map<AutonomyScope, AutonomyRunRecord[]>();
    const scopeRecords = byScope.get(args.scope) ?? [];
    const slot = this.#slots.get(args.scope) ?? makeSlot(args.scope);
    const expiresAt = Date.now() + this.#defaults.maxWindowMinutes * 60_000;

    const stageGraph: AutonomyGraph = catalogToGraph(
      args.runId,
      args.graphId,
      args.plan,
      args.signal.observedAt,
      expiresAt,
    );

    const record: AutonomyRunRecord = {
      recordId: makeRecordId(args.runId, args.scope),
      runId: args.runId,
      graphId: args.graphId,
      graph: stageGraph,
      slot,
      stage: args.scope,
      signal: args.signal,
      input: args.input,
      createdAt: args.signal.observedAt,
    };

    scopeRecords.push(record);
    byScope.set(args.scope, scopeRecords.slice(-this.#defaults.maxRecordsPerRun));
    this.#records.set(runKey, byScope);

    await this.usingGuard(args.scope, async () => {
      this.#slots.set(args.scope, makeSlot(args.scope));
      await Promise.resolve();
    });

    return ok(record);
  }

  public async query(query: NoInfer<AutonomyStoreQuery>): Promise<Result<AutonomyStorePage>> {
    if (this.#disposed) {
      return err(new Error('store disposed'));
    }

    const allRecords = [...this.#records.values()].flatMap((scopeMap) => [...scopeMap.values()].flat());

    const filtered = allRecords.filter((entry) => {
      if (query.runId && String(entry.runId) !== String(query.runId)) return false;
      if (query.graphId && String(entry.graphId) !== String(query.graphId)) return false;
      if (query.stage && entry.stage !== query.stage) return false;
      const timestamp = Date.parse(entry.createdAt);
      if (query.fromMs !== undefined && timestamp < query.fromMs) return false;
      if (query.toMs !== undefined && timestamp > query.toMs) return false;
      return true;
    });

    const ordered = uniqueBy(filtered, (record) => record.recordId).toSorted((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );

    const limit = query.limit ?? 128;
    const values = ordered.slice(0, limit);
    return ok({
      items: values,
      total: ordered.length,
      hasMore: ordered.length > limit,
      nextToken: ordered.length > limit ? String(Date.now()) : undefined,
    });
  }

  public async compact(runId: AutonomyRunId): Promise<Result<number>> {
    const scopeMap = this.#records.get(String(runId));
    if (!scopeMap) {
      return ok(0);
    }

    let removed = 0;
    for (const [scope, records] of scopeMap.entries()) {
      if (records.length > this.#defaults.compactBatch) {
        const next = records.slice(-this.#defaults.compactBatch);
        removed += records.length - next.length;
        scopeMap.set(scope, next);
        this.audit(scope, `compact ${removed}`);
      }
    }

    return ok(removed);
  }

  public async *replay(runId: AutonomyRunId, scopes: readonly AutonomyScope[] = AUTONOMY_SCOPE_SEQUENCE): AsyncGenerator<AutonomyRunRecord> {
    const run = this.#records.get(String(runId));
    if (!run) {
      return;
    }

    const normalized = scopes.flatMap((scope) => run.get(scope) ?? []);
    const sorted = [...normalized].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const record of sorted) {
      yield record;
      await Promise.resolve();
    }
  }

  public windows(): readonly ReturnType<typeof makeWindow>[] {
    return [...this.#records.entries()].map(([runId, scopeMap]) => {
      const records = [...scopeMap.values()].flat();
      return makeWindow(runId as AutonomyRunId, records);
    });
  }

  public collectAudit(): readonly AuditMessage[] {
    return AUTONOMY_SCOPE_SEQUENCE.map((scope) => ({
      scope,
      messages: [
        `namespace=${this.#defaults.namespace}`,
        `scope=${scope}`,
        `records=${this.#records.size}`,
      ],
    }));
  }

  public async diagnostics(): Promise<readonly AuditMessage[]> {
    return this.collectAudit();
  }

  public async usingGuard<T>(scope: AutonomyScope, action: () => Promise<T>): Promise<T> {
    await using guard = new AsyncDisposableStack();
    const close = () => {
      void guard;
      this.audit(scope, 'guard closed');
    };
    guard.defer(close);
    return await action();
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
    this.#records.clear();
    this.#slots.clear();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#records.clear();
    this.#slots.clear();
    await Promise.resolve();
  }

  private audit(scope: AutonomyScope, message: string): void {
    console.info(`[recovery-autonomy-store][${scope}] ${message}`);
  }
}

export const createStore = (defaults?: AutonomyStoreDefaults): AutonomyRunStore => new AutonomyRunStore(defaults);
