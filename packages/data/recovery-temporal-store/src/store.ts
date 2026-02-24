import {
  type Brand,
  type IsoTimestamp,
  asRunId,
  asTenantId,
  isoNow,
} from '@shared/temporal-ops-runtime';
import {
  buildSignal,
  normalizeNodeMap,
  type OrchestrationSignal,
  type TemporalRunbook,
  type TimelineNode,
  type TemporalPhase,
  createRunbook,
} from '@domain/recovery-temporal-orchestration';

export interface StoredRunbook {
  readonly runId: Brand<string, 'RunId'>;
  readonly source: TemporalRunbook;
  readonly status: 'planned' | 'running' | 'complete' | 'failed';
  readonly updatedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
}

export interface RunbookCommit {
  readonly runId: Brand<string, 'RunId'>;
  readonly before: TemporalRunbook | null;
  readonly after: TemporalRunbook;
  readonly committedAt: IsoTimestamp;
  readonly notes: readonly string[];
}

export interface TimelineStoreQuery {
  readonly tenant?: string;
  readonly scope?: string;
  readonly from?: number;
  readonly to?: number;
}

class InMemorySnapshot {
  readonly events: Array<OrchestrationSignal<'domain', unknown>> = [];
  readonly runbooks = new Map<Brand<string, 'RunId'>, StoredRunbook>();
  readonly commits: RunbookCommit[] = [];
}

const snapshots = new Map<string, InMemorySnapshot>();

export const createMemoryStore = (tenant: string): TemporalStore => {
  const key = tenant;
  let snapshot = snapshots.get(key);
  if (!snapshot) {
    snapshot = new InMemorySnapshot();
    snapshots.set(key, snapshot);
  }

  return new TemporalStore(snapshot);
};

export class TemporalStore {
  readonly #snapshot: InMemorySnapshot;

  constructor(snapshot: InMemorySnapshot) {
    this.#snapshot = snapshot;
  }

  insert(runbook: TemporalRunbook): StoredRunbook {
    const now = isoNow();
    const created = {
      runId: runbook.runId,
      source: structuredClone(runbook),
      status: 'planned',
      updatedAt: now,
      createdAt: now,
    } as StoredRunbook;

    this.#snapshot.runbooks.set(runbook.runId, created);
    return created;
  }

  upsert(runbook: TemporalRunbook, notes: readonly string[] = []): StoredRunbook {
    const runId = runbook.runId;
    const existing = this.#snapshot.runbooks.get(runId);
    const now = isoNow();
    const status = existing?.status ?? 'planned';
    const committed: RunbookCommit = {
      runId,
      before: existing?.source ?? null,
      after: runbook,
      committedAt: now,
      notes,
    };

    this.#snapshot.commits.push(committed);
    const stored: StoredRunbook = {
      runId,
      source: structuredClone(runbook),
      status,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    this.#snapshot.runbooks.set(runId, stored);
    return stored;
  }

  setStatus(runId: Brand<string, 'RunId'>, status: StoredRunbook['status']): void {
    const existing = this.#snapshot.runbooks.get(runId);
    if (!existing) {
      throw new Error(`missing runbook:${String(runId)}`);
    }
    this.#snapshot.runbooks.set(runId, {
      ...existing,
      status,
      updatedAt: isoNow(),
    });
  }

  list(query?: TimelineStoreQuery): ReadonlyArray<StoredRunbook> {
    const values = [...this.#snapshot.runbooks.values()];

    const byTenant = query?.tenant
      ? values.filter((entry) => String(entry.source.tenant).includes(query.tenant as string))
      : values;

    const byScope = query?.scope
      ? byTenant.filter((entry) => entry.source.scope.includes(query.scope as string))
      : byTenant;

    const byDate =
      query?.from || query?.to
        ? byScope.filter((entry) => {
            const time = Date.parse(entry.updatedAt);
            return (query?.from === undefined || time >= query.from) && (query?.to === undefined || time <= query.to);
          })
        : byScope;

    return byDate.toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  get(runId: Brand<string, 'RunId'>): StoredRunbook | undefined {
    return this.#snapshot.runbooks.get(runId);
  }

  remove(runId: Brand<string, 'RunId'>): boolean {
    return this.#snapshot.runbooks.delete(runId);
  }

  history(runId: Brand<string, 'RunId'>): readonly RunbookCommit[] {
    return this.#snapshot.commits.filter((commit) => commit.runId === runId).toSorted((left, right) => {
      return Date.parse(right.committedAt) - Date.parse(left.committedAt);
    });
  }

  appendSignal(signal: OrchestrationSignal<'domain', unknown>): void {
    this.#snapshot.events.push(signal);
  }

  latestSignals(limit = 10): readonly OrchestrationSignal<'domain', unknown>[] {
    return this.#snapshot.events.toSorted((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt)).slice(0, limit);
  }

  getSignalsByRun(runId: Brand<string, 'RunId'>): readonly OrchestrationSignal<'domain', unknown>[] {
    const target = String(runId);
    return this.#snapshot.events
      .filter((event) => event.runId === target)
      .toSorted((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt));
  }

  pruneSignals(olderThanMs: number): number {
    const before = this.#snapshot.events.length;
    const now = Date.now();
    this.#snapshot.events.splice(
      0,
      this.#snapshot.events.length -
        this.#snapshot.events.filter((event) => now - Date.parse(event.issuedAt) <= olderThanMs).length,
    );
    return before - this.#snapshot.events.length;
  }
}

export const createScopedStore = (tenant: string): TemporalStore => {
  const tenantId = asTenantId(tenant);
  const runbook = createRunbook('scoped-bootstrap', tenantId, tenant);
  const runId = asRunId(tenant, String(runbook.runId));
  const seedSignal = buildSignal(runId, 'domain', {
    source: tenant,
    scope: tenant,
  }, 60_000);

  const store = createMemoryStore(tenant);
  store.appendSignal(seedSignal);
  return store;
};

export interface StoreProjection {
  readonly tenant: string;
  readonly countsByStatus: Record<StoredRunbook['status'], number>;
  readonly newestRunId: Brand<string, 'RunId'> | undefined;
  readonly topPhases: readonly TemporalPhase[];
}

export const projectStore = (store: TemporalStore): StoreProjection => {
  const items = store.list();
  const countsByStatus = {
    planned: 0,
    running: 0,
    complete: 0,
    failed: 0,
  } as Record<StoredRunbook['status'], number>;

  for (const item of items) {
    countsByStatus[item.status] += 1;
  }

  const newest = items[0]?.runId;
  const topPhases = items
    .map((item) => normalizeNodeMap(item.source.nodes))
    .flatMap((nodeMap) => [...nodeMap.values()].map((node) => node.phase));

  const ordered = [...new Set(topPhases)]
    .map((phase) => phase)
    .toSorted();

  return {
    tenant: newest ? String(newest) : 'empty',
    countsByStatus,
    newestRunId: newest,
    topPhases: ordered,
  };
};
