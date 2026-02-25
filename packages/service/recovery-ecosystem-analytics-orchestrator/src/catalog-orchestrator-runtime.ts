import { mapWithIteratorHelpers, type NoInfer } from '@shared/type-level';
import { ok, fail, type Result } from '@shared/result';
import { asTenant, asNamespace, asWindow, asRun, asSession, type AnalyticsWindow, type AnalyticsTenant } from '@domain/recovery-ecosystem-analytics';
import type { AnalyticsPlanRecord } from '@domain/recovery-ecosystem-analytics';
import type { AnalyticsStore } from '@data/recovery-ecosystem-analytics-store';
import {
  createCatalogRegistry,
  createCatalogRuntime,
  catalogRuntimeFromStore,
  collectRuntimeDiagnostics,
  defaultCatalogRecords,
  queryCatalog,
  type CatalogQuery,
  type PlanCatalogRecord,
} from '@data/recovery-ecosystem-analytics-plan-catalog';

export interface PlanCatalogRuntimeFacade {
  readonly bootstrap: (plans: readonly AnalyticsPlanRecord[]) => Promise<Result<readonly PlanCatalogRecord[]>>;
  readonly query: (query: CatalogQuery) => Promise<readonly PlanCatalogRecord[]>;
  readonly register: (record: PlanCatalogRecord) => Promise<Result<PlanCatalogRecord>>;
  readonly registryWeights: () => number;
  readonly diagnostics: () => readonly string[];
  readonly close: () => Promise<Result<void>>;
}

type CatalogScope = {
  readonly catalogId: string;
  readonly label: string;
};

type CatalogEngineConfig = {
  readonly tenant: AnalyticsTenant;
  readonly namespace: ReturnType<typeof asNamespace>;
  readonly window: AnalyticsWindow;
};

const summarizeWeights = <TRecords extends readonly PlanCatalogRecord[]>(records: NoInfer<TRecords>): number =>
  records.reduce((acc, record, index) => acc + record.labels.length + index, records.length);

const normalizeQuery = (query: CatalogQuery): CatalogQuery => ({
  ...query,
  tenant: query.tenant ? asTenant(query.tenant) : asTenant('tenant:runtime'),
  namespace: query.namespace ? asNamespace(query.namespace) : asNamespace('namespace:recovery-ecosystem'),
  window: query.window ? asWindow(query.window.replace(/^window:/, '')) : asWindow('window:runtime'),
  status: query.status,
  labels: query.labels ?? [],
});

class PlanCatalogRuntime implements PlanCatalogRuntimeFacade {
  readonly #store: AnalyticsStore;
  readonly #runtime: ReturnType<typeof catalogRuntimeFromStore>;
  readonly #registry = createCatalogRegistry(defaultCatalogRecords, { includeSeed: true });
  readonly #config: CatalogEngineConfig;
  #closed = false;

  constructor(store: AnalyticsStore, config?: Partial<CatalogEngineConfig>) {
    this.#store = store;
    this.#config = {
      tenant: config?.tenant ?? asTenant('tenant:recovery-ecosystem'),
      namespace: config?.namespace ?? asNamespace('namespace:recovery-ecosystem'),
      window: config?.window ?? asWindow('window:recovery-ecosystem'),
    };
    this.#runtime = catalogRuntimeFromStore(
      store,
      this.#config.tenant,
      this.#config.namespace,
      this.#config.window,
    );
    void this.withCatalogScope({ catalogId: 'bootstrap', label: 'runtime' }, async () => {
      await this.#store.open({
        runId: asRun(`run:${Date.now()}`),
        tenant: this.#config.tenant,
        namespace: this.#config.namespace,
        window: this.#config.window,
        session: asSession(`session:${this.#config.tenant}`),
      });
    });
  }

  async withCatalogScope<T>(scope: CatalogScope, action: () => Promise<T>): Promise<T> {
    await using stack = new AsyncDisposableStack();
    try {
      return await action();
    } finally {
      void scope;
      await stack.disposeAsync();
    }
  }

  async bootstrap(plans: readonly AnalyticsPlanRecord[]): Promise<Result<readonly PlanCatalogRecord[]>> {
    if (this.#closed) {
      return fail(new Error('plan-catalog-runtime-closed'));
    }
    if (plans.length === 0) {
      return fail(new Error('plan-catalog-empty-plans'));
    }
    const seed = await this.#runtime.hydrateCatalog(plans);
    if (!seed.ok) {
      return seed;
    }
    for (const entry of seed.value) {
      this.#registry.register(entry);
    }
    return seed;
  }

  async query(query: CatalogQuery): Promise<readonly PlanCatalogRecord[]> {
    if (this.#closed) {
      return [];
    }
    const normalized = normalizeQuery(query);
    const records = this.#registry.snapshot();
    const match = queryCatalog(records, normalized);
    return match.records;
  }

  async register(record: PlanCatalogRecord): Promise<Result<PlanCatalogRecord>> {
    if (this.#closed) {
      return fail(new Error('plan-catalog-runtime-closed'));
    }
    const stamped = {
      ...record,
      updatedAt: new Date().toISOString(),
      labels: mapWithIteratorHelpers(record.labels, (label) => (`label:${label}` as const)),
    };
    const stored = this.#registry.register(stamped);
    await this.#runtime.upsert(stamped);
    const runId = asRun(`registry:${stored.catalogId}`);
    await this.#store.appendStage(runId, {
      stage: 'stage:registry',
      startedAt: new Date().toISOString(),
      status: 'running',
      diagnostics: [`upsert:${stored.catalogId}`],
    });
    return ok(stamped);
  }

  registryWeights(): number {
    return summarizeWeights(this.#registry.snapshot());
  }

  diagnostics(): readonly string[] {
    return collectRuntimeDiagnostics(this.#registry.snapshot());
  }

  async close(): Promise<Result<void>> {
    if (this.#closed) {
      return ok(undefined);
    }
    this.#closed = true;
    await this.#runtime.close();
    this.#registry.close();
    await this.#registry[Symbol.asyncDispose]();
    return ok(undefined);
  }
}

export const createPlanCatalogOrchestratorRuntime = (
  store: AnalyticsStore,
  config?: Partial<CatalogEngineConfig>,
): PlanCatalogRuntimeFacade => new PlanCatalogRuntime(store, config);
