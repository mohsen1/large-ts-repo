import { NoInfer } from '@shared/type-level';
import { InMemoryPolicyStore } from './store';
import { PolicyStoreFilters } from './types';
import { PolicyStoreArtifact, PolicyStoreRunRecord, PolicyStoreSort } from './types';

export type PolicyCatalogNamespace = `${string}-${'artifact' | 'run' | 'plan'}`;
export type PolicyCatalogId = `catalog:${string}`;
export type PolicyCatalogCategory = 'artifact' | 'run' | 'plan' | 'workflow' | 'metric';

export interface PolicyCatalogRecord<TPayload = unknown> {
  readonly id: PolicyCatalogId;
  readonly category: PolicyCatalogCategory;
  readonly namespace: PolicyCatalogNamespace;
  readonly revision: number;
  readonly payload: TPayload;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CatalogByCategory<TEntries extends readonly PolicyCatalogRecord[]> = {
  [T in TEntries[number] as `category:${T['category']}`]: ReadonlyArray<T>;
};

export interface CatalogWriteOptions {
  readonly namespace: PolicyCatalogNamespace;
  readonly category: PolicyCatalogCategory;
  readonly payload: Record<string, unknown>;
}

interface QueryKeyHints<T> {
  readonly key: keyof T & string;
  readonly values: readonly string[];
}

export const isCategory = (value: string): value is PolicyCatalogCategory =>
  value === 'artifact' || value === 'run' || value === 'plan' || value === 'workflow' || value === 'metric';

const withNamespace = (value: string): PolicyCatalogNamespace => `${value}-catalog` as PolicyCatalogNamespace;

export const createCatalogId = (namespace: string, category: PolicyCatalogCategory, revision = 1): PolicyCatalogId =>
  `catalog:${namespace}:${category}:${revision}` as PolicyCatalogId;

export class PolicyOrchestratorCatalog {
  #records = new Map<PolicyCatalogId, PolicyCatalogRecord>();

  public get namespaceCount(): number {
    return new Set([...this.#records.values()].map((record) => record.namespace)).size;
  }

  public get categoryCount(): number {
    return new Set([...this.#records.values()].map((record) => record.category)).size;
  }

  public upsert<TPayload>(input: Omit<PolicyCatalogRecord<TPayload>, 'updatedAt'>): PolicyCatalogRecord<TPayload> {
    const record: PolicyCatalogRecord<TPayload> = {
      ...input,
      namespace: withNamespace(String(input.namespace)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as PolicyCatalogRecord<TPayload>;
    this.#records.set(record.id, record);
    return record;
  }

  public all(): ReadonlyArray<PolicyCatalogRecord> {
    return [...this.#records.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public byNamespace(namespace: PolicyCatalogNamespace): ReadonlyArray<PolicyCatalogRecord> {
    return this.all().filter((record) => record.namespace === namespace);
  }

  public byCategory(category: PolicyCatalogCategory): ReadonlyArray<PolicyCatalogRecord> {
    return this.all().filter((record) => record.category === category);
  }

  public remove(id: PolicyCatalogId): boolean {
    return this.#records.delete(id);
  }

  public [Symbol.dispose](): void {
    this.#records.clear();
  }
}

const catalogToRecords = (artifacts: readonly PolicyStoreArtifact[]): readonly PolicyCatalogRecord[] =>
  artifacts
    .slice()
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .map((artifact) => ({
      id: createCatalogId(
        artifact.namespace,
        'artifact',
        Number.parseInt(String(artifact.revision), 10),
      ),
      category: 'artifact',
      namespace: withNamespace(artifact.namespace),
      revision: artifact.revision,
      payload: artifact,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    }));

const runRecordsToCatalog = (runs: readonly PolicyStoreRunRecord[]): readonly PolicyCatalogRecord[] =>
  runs
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((run) => ({
      id: createCatalogId(
        run.actor,
        'run',
        Number.parseInt(String(run.summary?.['revision'] ?? 1), 10),
      ),
      category: 'run',
      namespace: withNamespace(run.actor),
      revision: Number.parseInt(String(run.metrics?.['revision'] ?? 1), 10),
      payload: run,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    }));

export const buildRuntimeCatalog = async (
  store: InMemoryPolicyStore,
  orchestratorId = 'policy-lab-console-orchestrator',
): Promise<PolicyOrchestratorCatalog> => {
  const catalog = new PolicyOrchestratorCatalog();
  const artifacts = await store.searchArtifacts({ orchestratorId }, { key: 'updatedAt', order: 'desc' });
  const runs = await store.searchRuns(orchestratorId);

  for (const entry of [...catalogToRecords(artifacts), ...runRecordsToCatalog(runs)]) {
    catalog.upsert(entry);
  }

  return catalog;
};

export const splitCatalogByCategory = (
  records: readonly PolicyCatalogRecord[],
): CatalogByCategory<readonly PolicyCatalogRecord[]> => {
  const entries = [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const artifact = entries.filter((entry) => entry.category === 'artifact');
  const run = entries.filter((entry) => entry.category === 'run');
  const plan = entries.filter((entry) => entry.category === 'plan');
  const workflow = entries.filter((entry) => entry.category === 'workflow');
  const metric = entries.filter((entry) => entry.category === 'metric');
  return {
    'category:artifact': artifact,
    'category:run': run,
    'category:plan': plan,
    'category:workflow': workflow,
    'category:metric': metric,
  } as CatalogByCategory<readonly PolicyCatalogRecord[]>;
};

export const queryCatalogRecords = async (
  records: readonly PolicyCatalogRecord[],
  filters: NoInfer<PolicyStoreFilters>,
): Promise<ReadonlyArray<PolicyCatalogRecord>> => {
  return records.filter((record) => {
    if (filters.orchestratorId && !record.namespace.includes(filters.orchestratorId)) return false;
    if (filters.fromDate && record.updatedAt < filters.fromDate) return false;
    if (filters.toDate && record.updatedAt > filters.toDate) return false;
    return true;
  });
};

export const hintsFromCatalog = (catalog: PolicyOrchestratorCatalog): readonly QueryKeyHints<PolicyCatalogRecord>[] => {
  const namespaces = catalog.all().map((entry) => entry.namespace);
  const categories = catalog.all().map((entry) => entry.category);
  return [
    { key: 'namespace', values: Array.from(new Set(namespaces)) },
    { key: 'category', values: Array.from(new Set(categories)) },
  ];
};
