import { type Result, ok, err } from '@shared/result';
import { type Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';
import {
  type LatticeSessionId,
  type LatticeSessionRecord,
  type LatticeSnapshotPoint,
  type LatticeStoreAggregate,
  type LatticeStoreQuery,
  type LatticeRecordStore,
  buildRunEnvelope,
  type LatticeRunEnvelope,
  type LatticeTagMap,
  isFailureSession,
} from './models';

type LatticeSessionMap = Map<LatticeSessionId, LatticeSessionRecord>;

type LatticeSnapshotMap = Map<LatticeSessionId, readonly LatticeSnapshotPoint[]>;

const iteratorFrom =
  (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { filter<U extends (value: T) => boolean>(predicate: U): { toArray(): T[] }; toArray(): T[] } } }).Iterator?.from;

export const createLatticeStoreId = (tenantId: string, label: string): Brand<string, 'LatticeStore'> =>
  withBrand(`${tenantId}::${label}`, 'LatticeStore');

const toArray = <T>(source: Iterable<T>): T[] =>
  iteratorFrom?.(source)?.filter((value: T) => value != null).toArray() ?? [...source];

export class MemoryStressLabOrchestrationStore implements LatticeRecordStore {
  readonly #sessions: LatticeSessionMap;
  readonly #snapshots: LatticeSnapshotMap;
  readonly #sessionIndex: Map<string, LatticeSessionId[]>;
  readonly #storeId: Brand<string, 'LatticeStore'>;

  constructor(storeId: Brand<string, 'LatticeStore'>) {
    this.#sessions = new Map();
    this.#snapshots = new Map();
    this.#sessionIndex = new Map();
    this.#storeId = storeId;
  }

  public static create(tenantId: string): MemoryStressLabOrchestrationStore {
    return new MemoryStressLabOrchestrationStore(createLatticeStoreId(tenantId, 'runtime-store'));
  }

  public async upsertSession(session: LatticeSessionRecord): Promise<Result<LatticeSessionRecord, Error>> {
    try {
      const existing = this.#sessions.get(session.sessionId);
      this.#sessions.set(session.sessionId, session);
      const key = String(session.tenantId);
      const current = this.#sessionIndex.get(key) ?? [];

      if (!current.includes(session.sessionId)) {
        this.#sessionIndex.set(key, [...current, session.sessionId]);
      }

      const nextStatus = this.#snapshotForStatus(session.status);
      const indexKey = `${nextStatus}:${session.metadata.runName}`;
      const existingIndex = this.#sessionIndex.get(indexKey) ?? [];
      this.#sessionIndex.set(indexKey, existingIndex.includes(session.sessionId) ? existingIndex : [...existingIndex, session.sessionId]);

      if (session.status === 'completed' && this.#snapshots.has(session.sessionId) && !existing) {
        this.#snapshots.set(session.sessionId, []);
      }

      return ok(session);
    } catch (cause) {
      return err(cause instanceof Error ? cause : new Error('upsert failed'));
    }
  }

  public async appendSnapshots(
    sessionId: LatticeSessionId,
    snapshots: readonly LatticeSnapshotPoint[],
  ): Promise<Result<number, Error>> {
    try {
      const previous = this.#snapshots.get(sessionId) ?? [];
      const next = [...previous, ...snapshots];
      this.#snapshots.set(sessionId, next);
      return ok(next.length);
    } catch (cause) {
      return err(cause instanceof Error ? cause : new Error('append snapshots failed'));
    }
  }

  public async listSessions(query: LatticeStoreQuery): Promise<readonly LatticeSessionRecord[]> {
    const sessions = this.#snapshotSessions().filter((session) => this.matchesQuery(session, query));
    const limit = query.limit ?? sessions.length;
    return sessions.toSorted((left, right) => right.metadata.startedAt.localeCompare(left.metadata.startedAt)).slice(0, limit);
  }

  public async findSession(sessionId: LatticeSessionId): Promise<LatticeSessionRecord | undefined> {
    return this.#sessions.get(sessionId);
  }

  public async hydrateEnvelope(sessionId: LatticeSessionId): Promise<Result<LatticeRunEnvelope, Error>> {
    const session = this.#sessions.get(sessionId);
    if (!session) return err(new Error(`session not found: ${sessionId}`));
    const snapshots = this.#snapshots.get(sessionId) ?? [];
    return ok(buildRunEnvelope(session, snapshots));
  }

  public aggregate(query: LatticeStoreQuery): LatticeStoreAggregate {
    const sessions = this.#snapshotSessions().filter((session) => this.matchesQuery(session, query));
    const completed = sessions.filter((session) => session.status === 'completed');
    const failure = sessions.filter(isFailureSession);
    const activeSignalCount = sessions.flatMap((session) => session.signals).length;
    const scores = sessions.flatMap((session) => session.simulation.ticks.map((tick) => tick.confidence));
    const avgScore = this.average(scores);

    return {
      tenantCount: new Set(sessions.map((session) => session.tenantId)).size,
      runCount: sessions.length,
      completedCount: completed.length,
      activeSignalCount,
      avgScore,
      avgLatencyMs: failure.length * 11 + Math.max(1, sessions.length),
    };
  }

  public tags(): LatticeTagMap {
    const map: LatticeTagMap = {
      'tenant:all': Array.from(this.#sessionIndex.keys()),
      'tenant:active': this.#snapshotSessions().filter((session) => session.status === 'running').map((session) => String(session.tenantId)),
    };
    return map;
  }

  private matchesQuery(session: LatticeSessionRecord, query: LatticeStoreQuery): boolean {
    const hasTenant = query.tenantId === undefined || session.tenantId === query.tenantId;
    const hasStatus = query.runStatus === undefined || query.runStatus.includes(session.status);
    const from = query.from;
    const to = query.to;

    if (from && session.metadata.startedAt < from) {
      return false;
    }

    if (to && session.metadata.startedAt > to) {
      return false;
    }

    return hasTenant && hasStatus;
  }

  #snapshotSessions(): readonly LatticeSessionRecord[] {
    const raw = [...this.#sessions.values()];
    return iteratorFrom?.(raw)?.toArray() ?? raw;
  }

  #snapshotForStatus(status: LatticeSessionRecord['status']): 'completed' | 'active' | 'failed' | 'queued' {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    if (status === 'running') return 'active';
    return 'queued';
  }

  average(values: readonly number[]): number {
    const total = values.reduce((sum, value) => sum + value, 0);
    return values.length === 0 ? 0 : total / values.length;
  }
}

export class LatticeStoreManager {
  readonly #stores: Map<string, MemoryStressLabOrchestrationStore>;

  public constructor() {
    this.#stores = new Map();
  }

  public getOrCreate(tenantId: string): MemoryStressLabOrchestrationStore {
    const existing = this.#stores.get(tenantId);
    if (existing) return existing;
    const created = MemoryStressLabOrchestrationStore.create(tenantId);
    this.#stores.set(tenantId, created);
    return created;
  }

  public listAllSessions(query: LatticeStoreQuery): Promise<LatticeSessionRecord[]> {
    const tenants = query.tenantId ? [String(query.tenantId)] : [...this.#stores.keys()];
    const queries = tenants.map((tenantId) => this.getOrCreate(tenantId).listSessions(query));
    return Promise.all(queries).then((groups) => toArray(groups.flatMap((sessions) => sessions)));
  }

  public async toArray<T>(sessions: LatticeSessionRecord[][]): Promise<LatticeSessionRecord[]> {
    const flattened = sessions.flat();
    return flattened;
  }
}
