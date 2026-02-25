import { mapWithIteratorHelpers, type NoInfer } from '@shared/type-level';
import {
  asCatalogId,
  asCatalogTenant,
  asCatalogNamespace,
  asCatalogWindow,
  catalogPlanFromPhases,
  buildCatalogCatalogRecord,
  type CatalogPlanStatus,
  type PlanCatalogRecord,
} from './contracts';
import { defaultCatalogRecords } from './bootstrap';
import { queryCatalog } from './query';

export interface CatalogRegistryOptions {
  readonly maxDepth: number;
  readonly labelPrefix: string;
  readonly includeSeed: boolean;
}

type CatalogMap<TRecords extends readonly PlanCatalogRecord[]> = {
  [K in TRecords[number] as K['catalogId']]: K;
};

type RegistryState<TRecords extends readonly PlanCatalogRecord[]> = {
  byId: Map<PlanCatalogRecord['catalogId'], TRecords[number]>;
  signatures: Map<PlanCatalogRecord['catalogId'], string>;
  count: number;
};

export interface CatalogRegistryFacade {
  readonly map: <TRecords extends readonly PlanCatalogRecord[]>(records: TRecords) => Readonly<CatalogMap<TRecords>>;
  readonly register: <const TRecord extends PlanCatalogRecord>(record: NoInfer<TRecord>) => TRecord;
  readonly remove: (catalogId: PlanCatalogRecord['catalogId']) => boolean;
  readonly snapshot: () => readonly PlanCatalogRecord[];
  readonly active: () => readonly PlanCatalogRecord[];
  readonly refreshSignatures: () => Map<string, string>;
  readonly close: () => Promise<void>;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): PromiseLike<void>;
}

class CatalogRegistryImpl<TRecords extends readonly PlanCatalogRecord[]> implements CatalogRegistryFacade {
  readonly #state: RegistryState<TRecords>;
  readonly #options: CatalogRegistryOptions;

  constructor(records: NoInfer<TRecords> | undefined, options: Partial<CatalogRegistryOptions> = {}) {
    const seeded = (records ?? ([] as unknown as TRecords));
    this.#state = {
      byId: new Map(mapWithIteratorHelpers(seeded, (entry) => [entry.catalogId, entry])),
      signatures: new Map(),
      count: seeded.length,
    };
    this.#options = {
      maxDepth: options.maxDepth ?? 12,
      labelPrefix: options.labelPrefix ?? 'catalog',
      includeSeed: options.includeSeed ?? true,
    };
    this.refreshSignatures();
  }

  map<TNextRecords extends readonly PlanCatalogRecord[]>(records: TNextRecords): Readonly<CatalogMap<TNextRecords>> {
    const out: Record<string, PlanCatalogRecord> = {};
    for (const entry of records) {
      out[entry.catalogId] = entry;
    }
    return out as CatalogMap<TNextRecords>;
  }

  register<TRecord extends PlanCatalogRecord>(record: NoInfer<TRecord>): TRecord {
    const normalized = {
      ...record,
      updatedAt: new Date().toISOString(),
      labels: record.labels.map((label) => `${label}` as const),
    };
    const catalogId = asCatalogId(normalized.planId);
    const stored: TRecord = {
      ...normalized,
      catalogId,
      status: normalized.status ?? 'seed',
    } as TRecord;
    const withRoute = {
      ...stored,
      routeSignature: `${this.#options.labelPrefix}::${stored.status}::${stored.catalogId}` as const,
    } as TRecord;
    this.#state.byId.set(withRoute.catalogId, withRoute);
    this.#state.count += 1;
    this.#state.signatures.set(withRoute.catalogId, withRoute.fingerprint);
    return withRoute;
  }

  remove(catalogId: PlanCatalogRecord['catalogId']): boolean {
    const removed = this.#state.byId.delete(catalogId);
    if (removed) {
      this.#state.signatures.delete(catalogId);
      this.#state.count = Math.max(this.#state.count - 1, 0);
    }
    return removed;
  }

  snapshot(): readonly PlanCatalogRecord[] {
    return [...this.#state.byId.values()];
  }

  active(): readonly PlanCatalogRecord[] {
    return this.snapshot().filter((entry) => entry.status === 'active');
  }

  refreshSignatures(): Map<string, string> {
    const signatures = [...this.#state.byId.entries()].map(([key, value]) => [key, value.fingerprint] as const);
    this.#state.signatures = new Map(signatures);
    for (const [key, value] of signatures) {
      this.#state.signatures.set(key, value);
    }
    return this.#state.signatures;
  }

  close(): Promise<void> {
    this.#state.byId.clear();
    this.#state.signatures.clear();
    this.#state.count = 0;
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    void this.close();
  }

  [Symbol.asyncDispose](): PromiseLike<void> {
    return this.close();
  }
}

export const createCatalogRegistry = <TRecords extends readonly PlanCatalogRecord[]>(
  records: NoInfer<TRecords>,
  options?: Partial<CatalogRegistryOptions>,
): CatalogRegistryFacade => {
  const baseline = records.length > 0 ? records : (defaultCatalogRecords as TRecords);
  const registry = new CatalogRegistryImpl(baseline, options);
  if (options?.includeSeed ?? true) {
    for (const entry of baseline) {
      try {
        const normalized = {
          ...entry,
          catalogId: asCatalogId(entry.planId),
          labels: entry.labels,
          tags: entry.tags,
          status: entry.status,
        };
        registry.register(normalized as PlanCatalogRecord);
      } catch {
        // ignore duplicate seed records
      }
    }
  }
  return registry;
};

export const buildRegistryWeight = <TRecords extends readonly PlanCatalogRecord[]>(
  records: TRecords,
  weights: readonly number[] = [1, 2, 3, 5],
): number => {
  const weighted = queryCatalog(records, {
    tenant: asCatalogTenant('tenant:global'),
    namespace: asCatalogNamespace('namespace:global'),
    window: asCatalogWindow('window:global'),
  });
  return mapWithIteratorHelpers(records, (entry, index) => weights[index % weights.length]).reduce(
    (acc, weight) => acc + weight,
    0,
  ) + weighted.labels.length;
};

export const registryPlanCounts = (registry: CatalogRegistryFacade): ReadonlyMap<string, number> =>
  new Map(Array.from(registry.active().values()).map((entry) => [entry.catalogId, entry.labels.length]));

const normalizeState = <TStatus extends CatalogPlanStatus>(status: TStatus) => status;
export const isSeedLabel = (record: PlanCatalogRecord): boolean =>
  record.labels.some((label) => label.includes('seed')) || normalizeState(record.status) === 'seed';

export const rebuildFromSeed = (): readonly PlanCatalogRecord[] => {
  const seedPlans = defaultCatalogRecords.map((entry) =>
    buildCatalogCatalogRecord(
      {
        ...entry.plan,
        window: `window:rebuild-${entry.tenant}` as unknown as PlanCatalogRecord['window'],
        planId: entry.planId,
      } as const,
      `tenant:${entry.tenant.replace('tenant:', '')}`,
      `namespace:${entry.namespace.replace('namespace:', '')}`,
      isSeedLabel(entry) ? 'seed' : 'active',
    ),
  );
  return seedPlans;
};

const ensureCatalogTopology = (planId: string) =>
  catalogPlanFromPhases(planId, planId, ['bootstrap', 'evaluate', 'publish']).planId;
export const catalogPlanTemplate = (seed = 'catalog-seed'): string => ensureCatalogTopology(seed);
