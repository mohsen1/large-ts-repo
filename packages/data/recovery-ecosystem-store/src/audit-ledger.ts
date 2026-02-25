import { parseEvent } from './events';
import { eventStreamToArray } from './events';
import { bootstrappedEvents, bootstrappedSnapshots, seedEventForRun } from './fixtures';
import type { JsonValue } from '@shared/type-level';
import { asRunId, type NamespaceTag, type RunId, type StageId, type TenantId } from '@domain/recovery-ecosystem-core';
import type { EcosystemAuditEvent, EcosystemSnapshot, StoreEnvelope, StoreStats, StoreStatus, EcosystemStorePort } from './store-contract';

export type LedgerState = 'warm' | 'sealed' | 'flushed';

export interface AuditEnvelope<TValue extends JsonValue = JsonValue> {
  readonly id: `${string}-${string}`;
  readonly at: string;
  readonly namespace: NamespaceTag;
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly stage?: StageId;
  readonly event: `event:${string}`;
  readonly payload: TValue;
}

export interface LedgerSnapshot {
  readonly id: string;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly payload: JsonValue;
  readonly createdAt: string;
  readonly state: LedgerState;
}

export interface LedgerQuery<TPayload extends JsonValue = JsonValue> {
  readonly namespace?: NamespaceTag;
  readonly runId?: RunId;
  readonly tenant?: TenantId;
  readonly predicate?: (event: EcosystemAuditEvent<TPayload>) => boolean;
}

export type EventIterator<TPayload extends JsonValue = JsonValue> = AsyncGenerator<EcosystemAuditEvent<TPayload>, void, unknown>;

const iteratorFrom =
  (globalThis as { Iterator?: { from?: <TValue>(value: Iterable<TValue>) => IterableIterator<TValue> } }).Iterator?.from;

const toIterator = <TValue,>(values: readonly TValue[]): IterableIterator<TValue> => {
  if (!iteratorFrom) {
    return (function* () {
      for (const value of values) {
        yield value;
      }
    })();
  }
  return iteratorFrom(values);
};

const normalizeStage = (value: unknown): StageId | undefined =>
  typeof value === 'string' && value.startsWith('stage:') ? (value as StageId) : undefined;

export interface AuditRecord<TPayload extends JsonValue = JsonValue> {
  readonly envelope: StoreEnvelope<TValuePayload<TPayload>>;
  readonly event: AuditEnvelope<TPayload>;
}

export type TValuePayload<TPayload extends JsonValue> = {
  readonly event: AuditEnvelope<TPayload>['event'];
  readonly namespace: AuditEnvelope<TPayload>['namespace'];
  readonly payload: TPayload;
};

class LedgerRunHandle {
  readonly #runId: RunId;
  readonly #events = new Set<RunId>();

  public constructor(runId: RunId) {
    this.#runId = runId;
  }

  public get runId(): RunId {
    return this.#runId;
  }

  public mark(eventId: RunId): void {
    this.#events.add(eventId);
  }

  public [Symbol.dispose](): void {
    this.#events.clear();
  }
}

class LedgerScope implements AsyncDisposable {
  readonly #namespace: NamespaceTag;
  readonly #startedAt = new Date().toISOString();
  #closed = false;

  public constructor(namespace: NamespaceTag) {
    this.#namespace = namespace;
  }

  public get namespace(): NamespaceTag {
    return this.#namespace;
  }

  public get startedAt(): string {
    return this.#startedAt;
  }

  public get closed(): boolean {
    return this.#closed;
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }
}

export interface NamespaceWindow {
  readonly namespace: NamespaceTag;
  readonly runCount: number;
  readonly eventCount: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

class AuditLedger {
  readonly #events: EcosystemAuditEvent[] = [];
  readonly #snapshots = new Map<string, EcosystemSnapshot>();
  readonly #status = new Map<NamespaceTag, StoreStatus>();
  readonly #sealed = new Set<string>();
  #state: LedgerState = 'warm';

  public constructor() {
    for (const event of bootstrappedEvents) {
      this.#events.push(this.#parse(event));
    }
  }

  public async open(namespace: NamespaceTag): Promise<LedgerScope> {
    await this.#touch(namespace, 1);
    return new LedgerScope(namespace);
  }

  public async write(event: EcosystemAuditEvent<JsonValue>): Promise<LedgerRecord> {
    const parsed = this.#parse(event);
    this.#events.push(parsed);
    const status = this.#status.get(parsed.namespace) ?? {
      runCount: 0,
      eventCount: 0,
      lastUpdated: parsed.at,
    };
    this.#status.set(parsed.namespace, {
      runCount: status.runCount + 1,
      eventCount: status.eventCount + 1,
      lastUpdated: parsed.at,
    });
    this.#sealed.add(parsed.runId);
    return {
      id: `${parsed.namespace}:${parsed.runId}`,
      namespace: parsed.namespace,
      runId: parsed.runId,
      at: parsed.at,
      event: parsed,
      sealed: false,
    };
  }

  public async writeSnapshot(snapshot: EcosystemSnapshot): Promise<void> {
    this.#snapshots.set(String(snapshot.runId), snapshot);
  }

  public async query<TPayload extends JsonValue = JsonValue>(query: LedgerQuery<TPayload>): Promise<readonly EcosystemAuditEvent<TPayload>[]> {
    const events = [...this.#events].filter((event) => {
      const namespaceMatch = query.namespace ? event.namespace === query.namespace : true;
      const tenantMatch = query.tenant ? event.tenant === query.tenant : true;
      const runMatch = query.runId ? event.runId === query.runId : true;
      return namespaceMatch && tenantMatch && runMatch;
    });

    const normalized = query.predicate
      ? events.filter((event) => query.predicate?.(event as never) ?? true)
      : events;

    return normalized.toSorted((left, right) => left.at.localeCompare(right.at)) as unknown as readonly EcosystemAuditEvent<TPayload>[];
  }

  public async *stream<TPayload extends JsonValue = JsonValue>(query: LedgerQuery<TPayload>): EventIterator<TPayload> {
    const events = await this.query(query);
    const iterator = toIterator(events);
    for (const event of iterator) {
      yield event;
    }
  }

  public async snapshot(runId: RunId): Promise<LedgerRecord | undefined> {
    const found = this.#snapshots.get(String(runId));
    if (!found) {
      return undefined;
    }
    return {
      id: `${found.namespace}:${found.runId}`,
      namespace: found.namespace,
      runId: found.runId,
      at: found.generatedAt,
      event: {
        namespace: found.namespace,
        runId: found.runId,
        tenant: found.tenant,
        at: found.generatedAt,
        event: 'event:snapshot',
        stageId: undefined,
        payload: found.payload,
      },
      sealed: this.#sealed.has(String(found.runId)),
    };
  }

  public stats(namespace?: NamespaceTag): StoreStats {
    const namespaceSet = new Set<NamespaceTag>([...this.#snapshots.values()].map((snapshot) => snapshot.namespace));
    const filteredNamespaces = Array.from(namespaceSet).filter((entry) => (namespace ? entry === namespace : true));
    const events = this.#events.filter((entry) => (namespace ? entry.namespace === namespace : true));
    return {
      snapshots: namespace
        ? [...this.#snapshots.values()].filter((snapshot) => snapshot.namespace === namespace).length
        : this.#snapshots.size,
      events: events.length,
      namespaceCount: filteredNamespaces.length,
      lastFlush: this.#state === 'flushed' ? new Date().toISOString() : undefined,
    };
  }

  public async flush(): Promise<LedgerState> {
    await this.#flushAll();
    return this.#state;
  }

  public window(namespace: NamespaceTag): NamespaceWindow {
    const events = this.#events.filter((entry) => entry.namespace === namespace);
    const runs = new Set(events.map((entry) => entry.runId));
    const status = this.#status.get(namespace) ?? {
      runCount: 0,
      eventCount: 0,
      lastUpdated: new Date().toISOString(),
    };

    return {
      namespace,
      runCount: runs.size,
      eventCount: events.length,
      firstSeen: events.at(0)?.at ?? status.lastUpdated,
      lastSeen: events.at(-1)?.at ?? status.lastUpdated,
    };
  }

  public async seedFromStore(runId: RunId): Promise<readonly EcosystemAuditEvent[]> {
    const existing = seedEventForRun(runId);
    const stream = await this.query({ runId });
    return [...existing, ...stream].toSorted((left, right) => left.at.localeCompare(right.at));
  }

  public async hydrate(namespace: NamespaceTag, runId: RunId): Promise<{ readonly snapshot?: EcosystemSnapshot; readonly events: readonly EcosystemAuditEvent[] }> {
    const snapshot = this.#snapshots.get(String(runId));
    const events = await this.query({ namespace, runId });
    return {
      snapshot,
      events,
    };
  }

  public async withScope(namespace: NamespaceTag, callback: (scope: LedgerScope) => Promise<void>): Promise<void> {
    await using scope = await this.open(namespace);
    await callback(scope);
    if (!scope.closed) {
      await scope[Symbol.asyncDispose]();
    }
  }

  #parse(event: EcosystemAuditEvent): EcosystemAuditEvent {
    try {
      const parsed = parseEvent(event);
      return {
        ...parsed,
        namespace: parsed.namespace,
        runId: parsed.runId,
        tenant: parsed.tenant,
        stageId: normalizeStage(parsed.stageId),
        payload: parsed.payload,
      };
    } catch {
      return {
        ...event,
        stageId: normalizeStage((event as { stageId?: string }).stageId),
      };
    }
  }

  async #touch(namespace: NamespaceTag, increment = 1): Promise<void> {
    const existing = this.#status.get(namespace) ?? {
      runCount: 0,
      eventCount: 0,
      lastUpdated: new Date().toISOString(),
    };
    this.#status.set(namespace, {
      runCount: existing.runCount + increment,
      eventCount: existing.eventCount,
      lastUpdated: new Date().toISOString(),
    });
  }

  async #flushAll(): Promise<void> {
    for (const snapshot of bootstrappedSnapshots) {
      await this.writeSnapshot(snapshot);
      this.#sealed.add(String(snapshot.runId));
    }
    this.#state = 'flushed';
  }
}

interface LedgerRecord {
  readonly id: string;
  readonly namespace: NamespaceTag;
  readonly runId: RunId;
  readonly at: string;
  readonly event: EcosystemAuditEvent;
  readonly sealed: boolean;
}

export const createLedger = (): AuditLedger => {
  const ledger = new AuditLedger();
  const bootstrap = seedEventForRun(asRunId('bootstrap'));
  void Promise.all(
    bootstrap.map(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }),
  );
  return ledger;
};

export const bootstrapLedger: AuditLedger = createLedger();

export const ledgerForNamespace = async (
  ledger: AuditLedger,
  namespace: NamespaceTag,
): Promise<readonly LedgerRecord[]> => {
  const events = await ledger.query({ namespace });
  return events.map((event, index) => ({
    id: `${namespace}:${index}`,
    namespace: event.namespace,
    runId: event.runId,
    at: event.at,
    event,
    sealed: false,
  }));
};

export const collectByRun = async (
  ledger: AuditLedger,
  runId: string,
): Promise<readonly EcosystemAuditEvent<JsonValue>[]> => {
  const run = asRunId(runId);
  const events = await ledger.query<JsonValue>({ runId: run });
  return eventStreamToArray(await ledger.stream({ runId: run }) as AsyncIterable<EcosystemAuditEvent<JsonValue>>);
};
