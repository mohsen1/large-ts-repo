import { mapWithIteratorHelpers } from '@shared/type-level';
import {
  asCatalogTenant,
  asCatalogNamespace,
  asCatalogWindow,
  type CatalogQuery,
  type CatalogPlanStatus,
  type CatalogLabel,
  type PlanCatalogRecord,
} from './contracts';

export interface CatalogMatchGroup {
  readonly phase: string;
  readonly count: number;
  readonly ids: readonly string[];
}

export type CatalogSearchResult<TRecords extends readonly PlanCatalogRecord[]> = {
  readonly records: TRecords;
  readonly groups: readonly CatalogMatchGroup[];
  readonly labels: readonly string[];
  readonly fingerprint: string;
};

const normalizeQuery = (query: CatalogQuery): Required<CatalogQuery> => ({
  tenant: query.tenant ?? asCatalogTenant('tenant:global'),
  namespace: query.namespace ?? asCatalogNamespace('namespace:global'),
  window: query.window ?? asCatalogWindow('window:global'),
  status: query.status ?? [],
  labels: query.labels ?? [],
});

const collectPhase = (record: PlanCatalogRecord): CatalogMatchGroup => {
  const status = record.status;
  const ids = [record.catalogId];
  return {
    phase: status,
    count: ids.length,
    ids,
  };
};

const groupBy = (records: readonly PlanCatalogRecord[]): readonly CatalogMatchGroup[] => {
  const buckets = new Map<string, readonly string[]>();
  for (const entry of records) {
    const labels = buckets.get(entry.status) ?? [];
    buckets.set(entry.status, [...labels, entry.catalogId]);
  }
  return [...buckets.entries()].map(([phase, ids]) => ({
    phase,
    count: ids.length,
    ids,
  }));
};

const hasLabel = (entry: PlanCatalogRecord, labels: readonly CatalogLabel[]): boolean =>
  labels.every((label) => entry.labels.includes(label));

const hasStatus = (entry: PlanCatalogRecord, status: CatalogQuery['status']): boolean => {
  if (!status) {
    return true;
  }
  const statusBag = Array.isArray(status) ? status : [status];
  return statusBag.includes(entry.status);
};

const withLabelMatrix = (records: readonly PlanCatalogRecord[]) =>
  mapWithIteratorHelpers(records, (entry) => `${entry.catalogId}::${entry.labels.join(',')}`);

export const queryCatalog = <TRecords extends readonly PlanCatalogRecord[]>(
  records: TRecords,
  query: CatalogQuery,
): CatalogSearchResult<TRecords> => {
  const normalized = normalizeQuery(query);
  const filtered = mapWithIteratorHelpers(records, (entry) => entry).filter((entry) => {
    if (entry.tenant !== normalized.tenant) {
      return false;
    }
    if (entry.namespace !== normalized.namespace) {
      return false;
    }
    if (entry.window !== normalized.window) {
      return false;
    }
    if (!hasStatus(entry, normalized.status)) {
      return false;
    }
    if (!hasLabel(entry, normalized.labels)) {
      return false;
    }
    return true;
  });
  const groups = groupBy(filtered);
  const signature = filtered.length > 0 ? `match:${filtered[0].fingerprint}` : 'match:empty';
  const labels = withLabelMatrix(filtered);
  return {
    records: filtered as unknown as TRecords,
    groups,
    labels,
    fingerprint: signature,
  };
};

export const collectSignalCounts = (records: readonly PlanCatalogRecord[]): readonly number[] =>
  records.map((entry) => entry.labels.length + entry.tags.length);

export const toLabelMatrix = (records: readonly PlanCatalogRecord[]): readonly [string, string][] =>
  records.map((entry) => [entry.catalogId, entry.labels.join('|')]);

export const collectGroupsByTenant = (records: readonly PlanCatalogRecord[], tenant: string): readonly PlanCatalogRecord[] =>
  records.filter((entry) => entry.tenant === asCatalogTenant(tenant));

export const queryByStatus = <TRecords extends readonly PlanCatalogRecord[]>(
  status: CatalogPlanStatus,
  records: TRecords,
): readonly TRecords[number][] =>
  records.filter((entry) => entry.status === status);

export const collectPhases = (records: readonly PlanCatalogRecord[]): readonly string[] =>
  mapWithIteratorHelpers(records, collectPhase).map((entry) => entry.phase);
