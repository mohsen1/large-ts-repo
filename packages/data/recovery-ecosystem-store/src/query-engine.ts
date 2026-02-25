import type { NamespaceTag, TenantId } from '@domain/recovery-ecosystem-core';
import { asRunId, asTenantId } from '@domain/recovery-ecosystem-core';
import type { JsonValue } from '@shared/type-level';
import type { EcosystemAuditEvent, EcosystemStorePort, EcosystemSnapshot, StoreStats } from './store-contract';

type EventFilter = {
  readonly runId?: string;
  readonly tenant?: TenantId;
  readonly namespace?: NamespaceTag;
  readonly eventKind?: `event:${string}`;
  readonly stageId?: string;
  readonly from?: string;
  readonly to?: string;
};

type WindowBucket<TValues extends readonly EcosystemAuditEvent[]> = {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly values: TValues;
};

interface StreamWindow<TValues extends readonly EcosystemAuditEvent[]> {
  readonly namespace: NamespaceTag;
  readonly runId: string;
  readonly window: WindowBucket<TValues>;
}

type NamespaceBucket<TNamespace extends NamespaceTag = NamespaceTag> = {
  readonly namespace: TNamespace;
  readonly events: readonly EcosystemAuditEvent[];
  readonly snapshots: readonly EcosystemSnapshot[];
  readonly signatures: readonly string[];
};

export interface QueryBatch {
  readonly namespace: NamespaceTag;
  readonly runCount: number;
  readonly eventCount: number;
  readonly signatures: readonly string[];
}

type AsyncIterableSource<TValue> = AsyncIterable<TValue>;

const now = (): string => new Date().toISOString();

const normalizeTenant = (tenant?: string): TenantId => asTenantId(tenant?.trim() || 'tenant:default');
const normalizeRun = (runId?: string): string => runId?.trim() || `run:${Date.now()}`;

const normalizeKind = (kind?: string): `event:${string}` | undefined =>
  kind?.startsWith('event:') ? (`event:${kind.slice(6)}` as `event:${string}`) : undefined;

const normalizeByTime = <TEvent extends { readonly at: string }>(events: readonly TEvent[]): readonly TEvent[] =>
  [...events].toSorted((left, right) => left.at.localeCompare(right.at));

const clampLimit = (limit: number): number => {
  if (!Number.isFinite(limit)) {
    return 10;
  }
  return Math.max(1, Math.min(200, Math.floor(limit)));
};

const chunkEvents = <TEvent extends { readonly at: string }>(
  events: readonly TEvent[],
  size: number,
): readonly TEvent[][] => {
  const chunkSize = clampLimit(size);
  const normalized = normalizeByTime(events);
  const buckets: TEvent[][] = [];

  for (let index = 0; index < normalized.length; index += chunkSize) {
    buckets.push(normalized.slice(index, index + chunkSize));
  }

  return buckets;
};

const runSignature = (events: readonly EcosystemAuditEvent[]): string =>
  normalizeByTime(events)
    .map((event) => `${event.runId}@${event.event}@${event.at}`)
    .join('|');

const signatureWindow = (runId: string, events: readonly EcosystemAuditEvent[]): string =>
  `${runId}|${events.length}|${runSignature(events)}`;

export interface RunWindow<TValues extends readonly EcosystemAuditEvent[]> {
  readonly namespace: NamespaceTag;
  readonly runId: string;
  readonly window: WindowBucket<TValues>;
}

export class EcosystemQueryEngine {
  public constructor(private readonly store: EcosystemStorePort) {}

  public async querySnapshots(namespace: NamespaceTag, tenant?: string): Promise<readonly EcosystemSnapshot[]> {
    const tenantId = tenant ? asTenantId(tenant) : undefined;
    const snapshots = await this.store.query(namespace);
    return [...snapshots]
      .filter((snapshot) => !tenantId || snapshot.tenant === tenantId)
      .toSorted((left, right) => right.generatedAt.localeCompare(left.generatedAt))
      .toReversed();
  }

  public async queryEvents(filter: EventFilter): Promise<readonly EcosystemAuditEvent[]> {
    const runId = filter.runId ?? normalizeRun();
    const namespace = filter.namespace ?? ('namespace:global' as NamespaceTag);
    const stream = await this.store.read(asRunId(runId));
    const events: EcosystemAuditEvent[] = [];

    for await (const event of stream) {
      if (filter.tenant && event.tenant !== filter.tenant) {
        continue;
      }
      if (event.namespace !== namespace) {
        continue;
      }
      if (filter.eventKind && event.event !== normalizeKind(filter.eventKind)) {
        continue;
      }
      if (filter.stageId && event.stageId !== filter.stageId) {
        continue;
      }
      if (filter.from && event.at < filter.from) {
        continue;
      }
      if (filter.to && event.at > filter.to) {
        continue;
      }
      events.push(event);
    }

    return normalizeByTime(events);
  }

  public async queryBatch(namespace: NamespaceTag, tenant = 'tenant:default', limit = 100): Promise<QueryBatch> {
    const tenantId = normalizeTenant(tenant);
    const snapshots = await this.store.query(namespace);
    const selected = snapshots
      .filter((snapshot) => snapshot.tenant === tenantId)
      .toSorted((left, right) => right.generatedAt.localeCompare(left.generatedAt));

    const limited = selected.slice(0, clampLimit(limit));
    const windows = await Promise.all(
      limited.map((snapshot) =>
        this.queryEvents({
          runId: snapshot.runId,
          namespace,
          tenant: tenantId,
        }),
      ),
    );
    const events = windows.flat();

    const signatures = limited
      .map((snapshot, index) => signatureWindow(snapshot.runId, windows[index] ?? []))
      .filter(Boolean)
      .toSorted()
      .toReversed()
      .slice(0, 32);

    return {
      namespace,
      runCount: limited.length,
      eventCount: events.length,
      signatures,
    };
  }

  public async stats(): Promise<StoreStats> {
    return this.store.stats();
  }

  public async *runWindow(runId: string, namespace: NamespaceTag, size = 8): AsyncIterableSource<RunWindow<readonly EcosystemAuditEvent[]>> {
    const events = await this.queryEvents({
      runId,
      namespace,
      tenant: undefined,
    });

    const chunks = chunkEvents(events, size);
    for (const chunk of chunks) {
      const windowEvents = chunk as readonly EcosystemAuditEvent[];
      yield {
        namespace,
        runId,
        window: {
          startedAt: windowEvents.at(0)?.at ?? now(),
          endedAt: windowEvents.at(-1)?.at ?? now(),
          values: windowEvents,
        },
      };
    }
  }

  public async bucketByNamespace(namespace: NamespaceTag): Promise<NamespaceBucket<NamespaceTag>> {
    const snapshots = await this.store.query(namespace);
    const eventsByRun = await Promise.all(
      snapshots.map(async (snapshot) =>
        this.queryEvents({
          runId: snapshot.runId,
          namespace,
        }),
      ),
    );

    const allEvents = normalizeByTime(eventsByRun.flat()).filter((event) => event.namespace === namespace);
    const signatures = snapshots
      .map((snapshot, index) => signatureWindow(snapshot.runId, eventsByRun[index] ?? []))
      .filter((signature) => signature)
      .toSorted()
      .slice(0, 24);

    return {
      namespace,
      events: allEvents,
      snapshots,
      signatures,
    } as NamespaceBucket<NamespaceTag>;
  }
}

export const buildStreamWindow = <TValues extends readonly EcosystemAuditEvent[]>(window: StreamWindow<TValues>): StreamWindow<TValues> => ({
  ...window,
  window: {
    ...window.window,
    values: [...window.window.values] as unknown as TValues,
  },
});

export const summarizeEvents = (values: readonly { readonly event: `event:${string}` }[]): number =>
  values.reduce((acc, entry) => acc + entry.event.length, 0);

export const toJsonWindow = <TPayload extends JsonValue>(window: StreamWindow<readonly EcosystemAuditEvent[]>): StreamWindow<readonly EcosystemAuditEvent[]> => ({
  ...window,
  window: {
    ...window.window,
    values: window.window.values as readonly EcosystemAuditEvent<TPayload>[],
  },
});
