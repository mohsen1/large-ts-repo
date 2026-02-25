import { createHash } from 'node:crypto';
import type { JsonValue } from '@shared/type-level';
import type { EcosystemAuditEvent, EcosystemSnapshot, EcosystemStorePort, StoreEnvelope, StoreStats, StoreStatus } from './store-contract';
import { parseEvent, parseEnvelope } from './events';
import { bootstrappedEvents, bootstrappedSnapshots, seedEventForRun } from './fixtures';
import type { NamespaceTag, RunId, TenantId } from '@domain/recovery-ecosystem-core';

class MemoryRunScope implements AsyncDisposable {
  readonly #runId: RunId;
  readonly #startedAt = new Date().toISOString();
  #closed = false;

  public constructor(runId: RunId) {
    this.#runId = runId;
  }

  public get info() {
    return {
      runId: this.#runId,
      startedAt: this.#startedAt,
      closed: this.#closed,
    };
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }
}

class EventBuffer {
  readonly #events: EcosystemAuditEvent[] = [];

  public push(event: EcosystemAuditEvent): void {
    this.#events.push(event);
  }

  public async *iterate(runId: RunId): AsyncGenerator<EcosystemAuditEvent> {
    for await (const event of queueFromArray(this.#events.filter((entry) => entry.runId === runId))) {
      yield event;
    }
  }

  public forNamespace(namespace: NamespaceTag): readonly EcosystemAuditEvent[] {
    return this.#events.filter((entry) => entry.namespace === namespace);
  }

  public clear(): void {
    this.#events.length = 0;
  }

  public count(): number {
    return this.#events.length;
  }
}

class SnapshotStore {
  readonly #snapshots = new Map<RunId, EcosystemSnapshot>();

  public save(snapshot: EcosystemSnapshot): void {
    this.#snapshots.set(snapshot.runId, snapshot);
  }

  public read(runId: RunId): EcosystemSnapshot | undefined {
    return this.#snapshots.get(runId);
  }

  public namespaces(namespace: NamespaceTag): readonly EcosystemSnapshot[] {
    return [...this.#snapshots.values()].filter((snapshot) => snapshot.namespace === namespace);
  }

  public all(): readonly EcosystemSnapshot[] {
    return [...this.#snapshots.values()];
  }

  public clear(): void {
    this.#snapshots.clear();
  }
}

const queueFromArray = async function* <TValue>(values: readonly TValue[]): AsyncGenerator<TValue> {
  for (const value of values) {
    yield value;
  }
};

const hashEnvelope = (value: JsonValue): string => {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(value));
  return hash.digest('base64url').slice(0, 16);
};

const hydrateSnapshot = (snapshot: EcosystemSnapshot): EcosystemSnapshot => ({
  ...snapshot,
  generatedAt: snapshot.generatedAt,
  payload: snapshot.payload,
});

export class MemoryRecoveryStore implements EcosystemStorePort {
  readonly #events = new EventBuffer();
  readonly #snapshots = new SnapshotStore();
  readonly #flushed = new Set<RunId>();
  readonly #namespaceMeta = new Map<NamespaceTag, StoreStatus>();

  public constructor() {
    for (const snapshot of bootstrappedSnapshots) {
      this.#snapshots.save(snapshot);
    }
    for (const event of bootstrappedEvents) {
      this.#events.push(event);
    }
  }

  public async save(snapshot: EcosystemSnapshot): Promise<void> {
    const normalized = hydrateSnapshot(snapshot);
    const envelope = this.#buildEnvelope(snapshot.payload);
    parseEnvelope<JsonValue>(envelope);
    this.#snapshots.save(normalized);
    this.#flushed.delete(snapshot.runId);
  }

  public async load(runId: RunId): Promise<EcosystemSnapshot | undefined> {
    return this.#snapshots.read(runId);
  }

  public async append(event: EcosystemAuditEvent): Promise<void> {
    const parsed = parseEvent(event);
    const envelope = this.#buildEnvelope(parsed.payload);
    parseEnvelope<JsonValue>(envelope);
    this.#events.push(parsed);
    this.#flushed.delete(parsed.runId);
    const existing = this.#namespaceMeta.get(parsed.namespace) ?? {
      runCount: 0,
      eventCount: 0,
      lastUpdated: parsed.at,
    };
    this.#namespaceMeta.set(parsed.namespace, {
      runCount: existing.runCount + 1,
      eventCount: existing.eventCount + 1,
      lastUpdated: parsed.at,
    });
  }

  public async read(runId: RunId): Promise<AsyncIterable<EcosystemAuditEvent>> {
    const seedEvents = seedEventForRun(runId);
    const stream = this.#events.iterate(runId);
    const output: EcosystemAuditEvent[] = [...seedEvents];
    for await (const event of stream) {
      output.push(event);
    }
    return queueFromArray(output);
  }

  public async query(namespace: NamespaceTag): Promise<readonly EcosystemSnapshot[]> {
    return this.#snapshots.namespaces(namespace);
  }

  public async flush(): Promise<void> {
    for (const snapshot of this.#snapshots.all()) {
      this.#flushed.add(snapshot.runId);
    }
  }

  public async withRunScope<T>(runId: RunId, operation: (scope: MemoryRunScope) => Promise<T>): Promise<T> {
    await using scope = new MemoryRunScope(runId);
    void scope;
    return operation(scope);
  }

  public async loadAndHydrate(runId: RunId): Promise<{ readonly snapshot?: EcosystemSnapshot; readonly events: readonly EcosystemAuditEvent[] }> {
    const snapshot = this.#snapshots.read(runId);
    const seed = seedEventForRun(runId);
    const records = await this.read(runId);
    const collected: EcosystemAuditEvent[] = [];
    for await (const event of records) {
      collected.push(event);
    }
    return {
      snapshot,
      events: [...seed, ...collected],
    };
  }

  public stats(): StoreStats {
    const namespaces = new Set<NamespaceTag>(this.#snapshots.all().map((snapshot) => snapshot.namespace));
    return {
      snapshots: this.#snapshots.all().length,
      events: this.#events.count(),
      namespaceCount: namespaces.size,
      lastFlush: this.#flushed.size > 0 ? new Date().toISOString() : undefined,
    };
  }

  #buildEnvelope(payload: JsonValue): StoreEnvelope<JsonValue> {
    return {
      version: 'v1',
      payload,
      checksum: hashEnvelope(payload),
    };
  }
}

export const createInMemoryStore = (): EcosystemStorePort => new MemoryRecoveryStore();
