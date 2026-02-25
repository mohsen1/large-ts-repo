import type { QuantumRunRecord, QuantumStoreCursor, QuantumQueryStats } from './models';
import type { QuantumRunbook, QuantumTenantId } from '@domain/recovery-quantum-orchestration';
import { createChecksum } from './models';
import { applyRunFilters, buildFilterGraph } from './query';
import { decodePersisted, encodePersisted, toRecord, toRunbook } from './adapters';
import { filterIterator, mapIterator, consumeIterator } from '@shared/recovery-quantum-runtime';
import { withAsyncScope, withScope } from '@shared/recovery-quantum-runtime';

type StoreEvent = { readonly type: 'append' | 'query' | 'snapshot'; readonly payload: unknown };

const seedRunbook = {
  id: 'seed-runbook:1',
  tenant: 'tenant:alpha',
  name: 'Seed Runbook',
  region: 'tenant:alpha:region',
  signals: [
    {
      id: 'seed-signal:latency',
      tenant: 'tenant:alpha',
      name: 'seed-latency',
      severity: 'medium',
      dimension: 'latency',
      score: 0.66,
      payload: { source: 'bootstrap' },
      observedAt: new Date().toISOString(),
    },
  ] as const,
  plans: [
    {
      id: 'seed-plan',
      tenant: 'tenant:alpha',
      state: 'active',
      owner: 'bootstrap',
      steps: [
        {
          id: 'seed-step:1',
          signalId: 'seed-signal:latency',
          command: 'seed',
          expectedLatencyMs: 120,
        },
      ] as const,
      labels: ['bootstrap'] as const,
      metadata: { source: 'seed' } as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as const,
  metadata: {
    priority: 'p-tenant:alpha',
    zone: 'default',
    tags: ['seed'] as const,
  },
  policies: [
    {
      id: 'seed-policy',
      tenant: 'tenant:alpha',
      title: 'Seed Default Policy',
      weight: 2,
      scope: [{ name: 'global', tags: ['seed'] }],
    },
  ] as const,
};

const bootstrappedRecords = [seedRunbook].map((seed) => {
    const source = toRecord(seed as unknown as QuantumRunbook);
    const envelope = encodePersisted(source);
    return decodePersisted(envelope as unknown);
});

const createEventLog = (): {
  readonly list: StoreEvent[];
  readonly add: (event: StoreEvent) => void;
  readonly snapshot: () => readonly StoreEvent[];
} => {
  const list: StoreEvent[] = [];
  return {
    list,
    add(event) {
      list.push(event);
    },
    snapshot() {
      return list.slice(-200);
    },
  };
};

export class QuantumRunbookRepository {
  readonly #records = new Map<string, QuantumRunRecord>();
  readonly #eventLog = createEventLog();

  constructor(seed: readonly QuantumRunRecord[] = bootstrappedRecords) {
    for (const record of seed) {
      this.#records.set(record.id, record);
    }
    this.#eventLog.add({ type: 'snapshot', payload: { phase: 'boot', count: seed.length } });
  }

  async all(): Promise<readonly QuantumRunRecord[]> {
    return withScope('snapshot', (scope) => {
      scope.mark('all-start');
      const items = consumeIterator(this.#records.values());
      scope.mark(`all-end:${items.length}`);
      return items;
    });
  }

  async getById(id: string): Promise<QuantumRunRecord | undefined> {
    const record = this.#records.get(id);
    this.#eventLog.add({
      type: 'query',
      payload: { type: 'get', id, found: Boolean(record) },
    });
    return record;
  }

  async save(runbook: QuantumRunbook): Promise<QuantumRunRecord> {
    return withAsyncScope('save', async (scope) => {
      scope.mark('save:start');
      const record = toRecord(runbook);
      const checksum = createChecksum(record);
      const persisted: QuantumRunRecord = {
        ...record,
        metadata: {
          ...record.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
      this.#records.set(persisted.id, persisted);
      this.#eventLog.add({ type: 'append', payload: { id: persisted.id, checksum } });
      scope.mark('save:end');
      return persisted;
    });
  }

  async query(input: {
    readonly tenant?: string;
    readonly severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
    readonly from?: string;
  readonly to?: string;
  readonly includeIdle?: boolean;
}): Promise<{ readonly runbooks: readonly QuantumRunbook[]; readonly stats: QuantumQueryStats }> {
    const tenant = input.tenant as QuantumTenantId | undefined;
    const filterGraph = buildFilterGraph({
      tenant,
      severity: input.severity,
      fromIso: input.from,
      toIso: input.to,
    });
    const records = await this.all();
    const filter = filterGraph.filters[0];
    const result = applyRunFilters(records, {
      tenant: filter?.tenant as QuantumTenantId | undefined,
      severity: filter?.severity,
      from: filter?.fromIso,
      to: filter?.toIso,
      includeIdle: input.includeIdle,
    });
    const runbooks = mapIterator(result.data, (record) => toRunbook(record));
    const activeRecords = filterIterator(records, (record) => record.signals.length > 0);
    const activeCount = activeRecords.length;
    this.#eventLog.add({
      type: 'query',
      payload: {
        tenant,
        severity: input.severity,
        activeCount,
        matched: result.filtered,
      },
    });
    return {
      runbooks,
      stats: {
        total: result.total,
        matched: result.filtered,
        skipped: result.total - activeCount,
      },
    };
  }

  async iter(): Promise<readonly QuantumStoreCursor<QuantumRunRecord>[]> {
    const records = await this.all();
    return records.map((record, index) => ({
      index,
      value: record,
      done: index === records.length - 1,
    }));
  }

  async remove(id: string): Promise<boolean> {
    const removed = this.#records.delete(id);
    this.#eventLog.add({ type: 'query', payload: { type: 'remove', id, removed } });
    return removed;
  }

  async events(): Promise<readonly StoreEvent[]> {
    return this.#eventLog.snapshot();
  }
}

export const createRunbookRepository = (seed?: readonly QuantumRunbook[]): QuantumRunbookRepository => {
  const records = seed?.map((runbook) => toRecord(runbook)) ?? bootstrappedRecords;
  return new QuantumRunbookRepository(records);
};
