import { Brand } from '@shared/type-level';
import { MeshRunId, type MeshRoute } from '@shared/recovery-ops-runtime';
import {
  makeTenantId,
  makeScenarioId,
  sampleEvents,
  type ResilienceEvent,
} from '@domain/recovery-resilience-models';
import type {
  SearchResult,
  EventRecord,
  StoreQuery,
  StoreRecordId,
  ReadWriteStore,
} from './types.js';
import { runSearch, summarizeByZone, summarizeByType, takeTop, filterRecords } from './queries.js';

const withPolicyId = (tenantId: string) => `policy-${tenantId}` as Brand<string, 'scenario-policy-id'>;

export interface ResilienceRecordStore {
  add(record: EventRecord): Promise<void>;
  bulkAdd(records: readonly EventRecord[]): Promise<number>;
  find(query: StoreQuery): Promise<SearchResult>;
  metrics(): Promise<Readonly<Record<string, number>>>;
  byRun(runId: string): Promise<readonly EventRecord[]>;
  close(): Promise<void>;
  hydrateFromSamples(count: number, tenant?: string): Promise<number>;
}

const normalizeRunId = (seed: string): MeshRunId => `run-${seed}` as MeshRunId;

export class InMemoryResilienceStore implements ResilienceRecordStore, ReadWriteStore<EventRecord> {
  #records = new Map<StoreRecordId, EventRecord>();

  async add(record: EventRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async bulkAdd(records: readonly EventRecord[]): Promise<number> {
    for (const record of records) {
      await this.add(record);
    }
    return records.length;
  }

  async find(query: StoreQuery): Promise<SearchResult> {
    const result = runSearch([...this.#records.values()], query);
    if (result.ok) {
      return result.value;
    }

    return {
      records: [],
      total: 0,
      audit: {
        generatedAt: new Date().toISOString(),
        source: 'recovery-resilience-store',
        meta: {
          runId: query.runId ?? normalizeRunId('fallback-run'),
          startedAt: Date.now(),
          owner: query.tenantId ? `${query.tenantId}` : 'fallback',
          zone: 'core',
          tags: ['fallback'],
        },
      },
    };
  }

  async metrics(): Promise<Readonly<Record<string, number>>> {
    const events = [...this.#records.values()];
    return {
      total: events.length,
      ...summarizeByZone(events),
      ...summarizeByType(events),
    };
  }

  async byRun(runId: string): Promise<readonly EventRecord[]> {
    const all = [...this.#records.values()];
    const filtered = filterRecords(all, { runId: runId as MeshRunId });
    return takeTop(filtered, 100);
  }

  async read(): Promise<EventRecord[]> {
    return [...this.#records.values()];
  }

  async write(item: EventRecord): Promise<void> {
    await this.add(item);
  }

  async clear(): Promise<void> {
    this.#records.clear();
  }

  async close(): Promise<void> {
    await this.clear();
  }

  async hydrateFromSamples(count: number, tenant = 'tenant-sample'): Promise<number> {
    const scenarioId = makeScenarioId(tenant);
    const seeded = sampleEvents(count, scenarioId);
    const records: EventRecord[] = seeded.map((event: ResilienceEvent, index: number) => toEventRecord(event, tenant, index));
    return this.bulkAdd(records);
  }
}

const toEventRecord = (event: ResilienceEvent, tenant: string, index: number): EventRecord => ({
  id: `seed-${tenant}-${index}` as StoreRecordId,
  runId: `run-${tenant}-${index}` as MeshRunId,
  tenant: {
    tenantId: makeTenantId(tenant),
    zone: event.zone,
    route: event.route as MeshRoute,
  },
  eventType: event.type,
  zone: event.zone,
  severity: event.severityLabel,
  route: event.route as MeshRoute,
  policyId: withPolicyId(tenant),
  payload: event.payload as Readonly<Record<string, unknown>>,
  createdAt: Date.now() + index * 123,
});

export const createStore = (): ResilienceRecordStore => new InMemoryResilienceStore();

export const bootstrapStore = async (): Promise<ResilienceRecordStore> => {
  const store = createStore();
  await store.hydrateFromSamples(12, 'tenant-bootstrap');
  return store;
};
