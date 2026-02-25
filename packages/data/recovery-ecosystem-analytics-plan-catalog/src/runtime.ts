import { mapWithIteratorHelpers } from '@shared/type-level';
import {
  asCatalogId,
  asCatalogNamespace,
  asCatalogTenant,
  asCatalogWindow,
  asCatalogWindow as normalizeCatalogWindow,
  buildCatalogCatalogRecord,
  type PlanCatalogRecord,
  type CatalogQuery,
  type PlanCatalogRunRecord,
} from './contracts';
import {
  toRuntimeEvent,
  buildCatalogPlanFingerprint,
} from './schema';
import { defaultCatalogRecords } from './bootstrap';
import type {
  AnalyticsStoreSignalEvent,
  AnalyticsStore,
} from '@data/recovery-ecosystem-analytics-store';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { AnalyticsPlanRecord } from '@domain/recovery-ecosystem-analytics';
import { asRun, asSession } from '@domain/recovery-ecosystem-analytics';

type RuntimeOptions = {
  readonly tenant: string;
  readonly namespace: string;
  readonly window: string;
  readonly capacity?: number;
};

type RuntimeQuery = {
  readonly records: readonly PlanCatalogRecord[];
  readonly runs: readonly PlanCatalogRunRecord[];
};

export interface PlanCatalogRuntimeFacade {
  hydrateCatalog(plans: readonly AnalyticsPlanRecord[]): Promise<Result<readonly PlanCatalogRecord[]>>;
  upsert(record: PlanCatalogRecord): Promise<Result<PlanCatalogRecord>>;
  query(query: CatalogQuery): Promise<readonly PlanCatalogRecord[]>;
  collectRuns(): Promise<readonly PlanCatalogRunRecord[]>;
  close(): Promise<Result<void>>;
}

interface RuntimeStore {
  readonly open: (record: PlanCatalogRecord) => Promise<void>;
  readonly close: (catalogId: PlanCatalogRecord['catalogId']) => Promise<void>;
  readonly query: (query: CatalogQuery) => Promise<readonly PlanCatalogRecord[]>;
  readonly collectRuns: () => Promise<readonly PlanCatalogRunRecord[]>;
  readonly closeAll: () => Promise<void>;
}

const makeNoop = <T>(value: T): T => value;

class MemoryCatalogStore implements RuntimeStore {
  readonly #records = new Map<string, PlanCatalogRecord>();
  readonly #runs = new Map<string, PlanCatalogRunRecord>();
  readonly #options: RuntimeOptions;
  #closed = false;

  constructor(options: RuntimeOptions) {
    this.#options = {
      ...options,
      capacity: options.capacity ?? 256,
    };
  }

  async open(record: PlanCatalogRecord): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#records.set(record.catalogId, {
      ...record,
      updatedAt: new Date().toISOString(),
    });
    this.#runs.set(record.catalogId, {
      runId: asRun(`catalog:${record.catalogId}`),
      catalogId: record.catalogId,
      tenant: asCatalogTenant(this.#options.tenant),
      namespace: asCatalogNamespace(this.#options.namespace),
      startedAt: new Date().toISOString(),
      events: [],
    });
    if (this.#records.size > (this.#options.capacity ?? 256)) {
      const oldest = this.#records.keys().next().value;
      if (oldest) {
        this.#records.delete(oldest);
        this.#runs.delete(oldest);
      }
    }
  }

  async close(catalogId: PlanCatalogRecord['catalogId']): Promise<void> {
    if (this.#closed) {
      return;
    }
    const current = this.#records.get(catalogId);
    if (current) {
      this.#records.set(catalogId, { ...current, status: 'archived', updatedAt: new Date().toISOString() });
    }
    const run = this.#runs.get(catalogId);
    if (run) {
      this.#runs.set(catalogId, { ...run, events: [...run.events, ...makeNoop([])] });
    }
  }

  async query(query: CatalogQuery): Promise<readonly PlanCatalogRecord[]> {
    const tenant = asCatalogTenant(query.tenant?.toString() ?? this.#options.tenant);
    const namespace = asCatalogNamespace(query.namespace?.toString() ?? this.#options.namespace);
    const window = asCatalogWindow(query.window?.toString() ?? this.#options.window);
    const status = query.status
      ? Array.isArray(query.status)
        ? query.status
        : [query.status]
      : undefined;
    const labels = query.labels ?? [];
    return mapWithIteratorHelpers([...this.#records.values()], (entry) => entry).filter((entry) => {
      if (entry.tenant !== tenant) {
        return false;
      }
      if (entry.namespace !== namespace) {
        return false;
      }
      if (entry.window !== window) {
        return false;
      }
      if (status && status.length > 0 && !status.includes(entry.status)) {
        return false;
      }
      return labels.every((label) => entry.labels.includes(label));
    });
  }

  async collectRuns(): Promise<readonly PlanCatalogRunRecord[]> {
    return [...this.#runs.values()];
  }

  async closeAll(): Promise<void> {
    this.#closed = true;
    this.#records.clear();
    this.#runs.clear();
  }
}

export class PlanCatalogRuntime implements PlanCatalogRuntimeFacade {
  readonly #store: RuntimeStore;
  readonly #adapter: AnalyticsStore;
  readonly #options: RuntimeOptions;
  #closed = false;

  constructor(adapter: AnalyticsStore, options: RuntimeOptions) {
    this.#adapter = adapter;
    this.#options = {
      tenant: asCatalogTenant(options.tenant),
      namespace: asCatalogNamespace(options.namespace),
      window: asCatalogWindow(options.window),
      capacity: options.capacity ?? 256,
    };
    this.#store = new MemoryCatalogStore(this.#options);
    void this.#seedAdapter();
  }

  async #seedAdapter(): Promise<void> {
    const seedEvent = toRuntimeEvent(`runtime-${this.#options.tenant}`, {
      source: 'catalog-runtime-seed',
      tenant: this.#options.tenant,
      namespace: this.#options.namespace,
    });
    await this.#adapter.append({
      id: `event:${Date.now()}` as `event:${number}`,
      kind: 'signal:catalog-seed',
      runId: asRun(`seed:${seedEvent.runId}`),
      session: asSession(`session:${seedEvent.runId}`),
      tenant: asCatalogTenant(this.#options.tenant),
      namespace: asCatalogNamespace(this.#options.namespace),
      window: normalizeCatalogWindow(this.#options.window),
      payload: {
        seed: seedEvent.runId,
        source: 'seed',
        fingerprint: seedEvent.events[0]?.value,
      },
      at: new Date().toISOString(),
    });
  }

  async hydrateCatalog(plans: readonly AnalyticsPlanRecord[]): Promise<Result<readonly PlanCatalogRecord[]>> {
    if (this.#closed) {
      return fail(new Error('plan-catalog-runtime-closed'));
    }
    const normalized = plans.map((plan) => buildCatalogCatalogRecord(plan, plan.tenant, plan.namespace, 'active'));
    for (const [index, entry] of normalized.entries()) {
      await this.#store.open(entry);
      const adapterEvent: AnalyticsStoreSignalEvent = {
        id: `event:${Date.now() + index}` as `event:${number}`,
        kind: 'signal:catalog-hydrate',
        runId: asRun(`hydrate:${entry.catalogId}`),
        session: asSession(`session:${entry.catalogId}`),
        tenant: asCatalogTenant(this.#options.tenant),
        namespace: asCatalogNamespace(this.#options.namespace),
        window: normalizeCatalogWindow(this.#options.window),
        payload: {
          catalogId: entry.catalogId,
          planId: entry.planId,
          status: entry.status,
        },
        at: new Date().toISOString(),
      };
      await this.#adapter.append(adapterEvent);
    }
    return ok(normalized);
  }

  async upsert(record: PlanCatalogRecord): Promise<Result<PlanCatalogRecord>> {
    if (this.#closed) {
      return fail(new Error('plan-catalog-runtime-closed'));
    }
    const stamped: PlanCatalogRecord = {
      ...record,
      catalogId: asCatalogId(record.planId),
      fingerprint: buildCatalogPlanFingerprint([record]),
      updatedAt: new Date().toISOString(),
      labels: mapWithIteratorHelpers(record.labels, (label) => (`label:${label}` as const)),
      tags: mapWithIteratorHelpers(record.tags, (tag) => (`tag:${tag}` as const)),
    };
    await this.#store.open(stamped);
    await this.#adapter.append({
      id: `event:${Date.now()}` as `event:${number}`,
      kind: 'signal:catalog-upsert',
      runId: asRun(`upsert:${stamped.catalogId}`),
      session: asSession(`session:${stamped.catalogId}`),
      tenant: asCatalogTenant(this.#options.tenant),
      namespace: asCatalogNamespace(this.#options.namespace),
      window: normalizeCatalogWindow(this.#options.window),
      payload: {
        catalogId: stamped.catalogId,
        tags: [...stamped.tags],
        labels: [...stamped.labels],
      },
      at: new Date().toISOString(),
    });
    return ok(stamped);
  }

  async query(query: CatalogQuery): Promise<readonly PlanCatalogRecord[]> {
    if (this.#closed) {
      return [];
    }
    return this.#store.query(query);
  }

  async collectRuns(): Promise<readonly PlanCatalogRunRecord[]> {
    if (this.#closed) {
      return [];
    }
    return this.#store.collectRuns();
  }

  async close(): Promise<Result<void>> {
    if (this.#closed) {
      return ok(undefined);
    }
    this.#closed = true;
    await this.#store.closeAll();
    const current = await this.#store.query({ tenant: asCatalogTenant(this.#options.tenant), namespace: asCatalogNamespace(this.#options.namespace), window: asCatalogWindow(this.#options.window) });
    void current;
    return ok(undefined);
  }
}

export const createPlanCatalogRuntimeStore = (options: RuntimeOptions): RuntimeStore =>
  new MemoryCatalogStore(options);

export const createPlanCatalogRuntime = (store: AnalyticsStore, options: RuntimeOptions): PlanCatalogRuntimeFacade =>
  new PlanCatalogRuntime(store, options);

export const createCatalogRuntime = (options: RuntimeOptions, store: AnalyticsStore): PlanCatalogRuntimeFacade =>
  new PlanCatalogRuntime(store, options);

export const catalogRuntimeFromStore = (store: AnalyticsStore, tenant: string, namespace: string, window: string): PlanCatalogRuntimeFacade =>
  new PlanCatalogRuntime(store, { tenant, namespace, window });

export const collectRuntimeDiagnostics = (records: readonly PlanCatalogRecord[]): readonly string[] =>
  records.map((entry) => `${entry.catalogId}::${entry.fingerprint}`);

export const seedFromDefaults = async (
  store: AnalyticsStore,
): Promise<readonly PlanCatalogRunRecord[]> => {
  const runtime = new PlanCatalogRuntime(store, {
    tenant: 'tenant:runtime',
    namespace: 'namespace:runtime',
    window: 'window:runtime',
  });
  await runtime.hydrateCatalog(defaultCatalogRecords.map((entry) => entry.plan));
  return runtime.collectRuns();
};

export const collectRuntimeState = (records: readonly PlanCatalogRecord[]): RuntimeQuery => ({
  records: records,
  runs: records.map((entry) => toRuntimeEvent(entry.planId, entry.fingerprint)),
});
