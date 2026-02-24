import { NoInfer, Optionalize, UnionToIntersection } from '@shared/type-level';
import { withBrand } from '@shared/core';
import { asRouteId, asTenantId, type LatticeContext, type LatticeTenantId } from '@domain/recovery-lattice';
import type { LatticeSnapshotRecord, LatticeStoreCursor, LatticeStoreResult, LatticeStoreQuery } from './types';

export type SnapshotTuple<T extends readonly LatticeSnapshotRecord[]> =
  T extends readonly [
    infer Head extends LatticeSnapshotRecord,
    ...infer Tail extends readonly LatticeSnapshotRecord[],
  ]
    ? readonly [Head, ...SnapshotTuple<Tail>]
    : readonly [];

export type ContextMerge<T extends readonly LatticeSnapshotRecord[]> = T extends readonly [
  infer Head extends LatticeSnapshotRecord,
  ...infer Tail extends readonly LatticeSnapshotRecord[],
]
  ? UnionToIntersection<Head['context'] & ContextMerge<Tail>>
  : {};

export type RecordTag<T extends string> = `tag:${Lowercase<T>}`;

export interface SnapshotContextShape {
  readonly tenant: LatticeTenantId;
  readonly route: string;
  readonly hasError: boolean;
}

export interface SnapshotQueryWindow {
  readonly query: LatticeStoreQuery;
  readonly cursor?: LatticeStoreCursor;
  readonly limit: number;
  readonly strict: boolean;
}

export interface SnapshotWindowResult<TRecord extends LatticeSnapshotRecord = LatticeSnapshotRecord> {
  readonly tenantId: LatticeTenantId;
  readonly windows: readonly TRecord[];
  readonly cursor: LatticeStoreCursor | undefined;
  readonly total: number;
}

const normalizeTag = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');

const toRouteKey = (value: string): string => asRouteId(normalizeTag(value)).toString();

const resolveRoute = (value: string): string => toRouteKey(value).replace('route:', '');

export const pickRoutes = <T extends readonly LatticeSnapshotRecord[]>(
  records: NoInfer<T>,
  limit = 25,
): readonly string[] => {
  const unique = new Set<string>();
  for (const record of records) {
    unique.add(resolveRoute(record.routeId));
    if (unique.size >= limit) break;
  }
  return [...unique];
};

export const pickTenants = <T extends readonly LatticeSnapshotRecord[]>(
  records: NoInfer<T>,
): readonly LatticeTenantId[] => {
  const byTenant = new Map<string, LatticeSnapshotRecord>();
  for (const record of records) {
    byTenant.set(record.tenantId, record);
  }
  return [...byTenant.keys()].map((tenantId) => asTenantId(tenantId));
};

export const routeHistogram = <TRecord extends LatticeSnapshotRecord>(
  records: readonly TRecord[],
): Readonly<Record<string, number>> => {
  const buckets = new Map<string, number>();
  for (const record of records) {
    const route = resolveRoute(String(record.routeId));
    buckets.set(route, (buckets.get(route) ?? 0) + 1);
  }
  return Object.fromEntries([...buckets.entries()].toSorted((left, right) => right[1] - left[1]));
};

export const summarizePayload = <TContext extends Record<string, unknown>>(
  records: readonly LatticeSnapshotRecord[],
  selector?: (record: LatticeSnapshotRecord) => TContext,
): readonly TContext[] => {
  if (!selector) {
    return records.map((record) => record.context as unknown as TContext);
  }
  return records.map(selector);
};

export const mergeContexts = <T extends readonly LatticeSnapshotRecord[]>(
  records: NoInfer<T>,
): ContextMerge<T> => {
  const reduced = records.reduce<Record<string, unknown>>((acc, record) => {
    for (const [key, value] of Object.entries(record.context)) {
      acc[key] = value;
    }
    return acc;
  }, {});
  return reduced as ContextMerge<T>;
};

export const makeWindowCursor = (record: LatticeSnapshotRecord, index: number): LatticeStoreCursor => ({
  id: withBrand(`${record.id}::${index}`, 'lattice-store-id'),
  at: record.updatedAt,
});

export const pageFromWindow = async <TReturn extends LatticeSnapshotRecord>(
  result: LatticeStoreResult<TReturn>,
  limit = 25,
): Promise<SnapshotWindowResult<TReturn>> => {
  const hasCursor = Boolean(result.cursor);
  return {
    tenantId: asTenantId(result.cursor ? result.cursor.id : 'tenant:default'),
    windows: result.records,
    cursor: hasCursor ? result.cursor : undefined,
    total: Math.min(limit, result.total),
  };
};

export const mapWindowRoute = <TRecord extends LatticeSnapshotRecord, TProjection extends { route: string }>(
  records: readonly TRecord[],
  mapper: (record: TRecord) => TProjection,
): ReadonlyArray<TProjection & { index: number }> =>
  records.map((record, index) => ({
    ...mapper(record),
    index,
  }));

export const filterByRoutePrefix = <TRecord extends LatticeSnapshotRecord>(
  records: readonly TRecord[],
  prefix: string,
): readonly TRecord[] => records.filter((record) => resolveRoute(record.routeId).startsWith(prefix));

export const hydrateSnapshotContexts = <T extends readonly LatticeSnapshotRecord[]>(
  records: T,
  patch: Partial<LatticeContext>,
): SnapshotTuple<T> => {
  return records.map((record) => ({
    ...record,
    context: {
      ...record.context,
      ...patch,
    },
  })) as unknown as SnapshotTuple<T>;
};

export const buildContextFingerprint = (context: LatticeContext): string => {
  return Object.entries(context)
    .toSorted((left, right) => left[0].localeCompare(right[0]))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
};

export const compareContext = (left: LatticeContext, right: LatticeContext): boolean =>
  buildContextFingerprint(left) === buildContextFingerprint(right);

export const asWindowQuery = (
  tenantId: LatticeTenantId,
  routeId?: string,
): Optionalize<LatticeStoreQuery, 'fromDate' | 'toDate'> => {
  const query: LatticeStoreQuery = {
    tenantId,
    routeId: routeId ? asRouteId(routeId) : undefined,
  };
  return query;
};

export const routeSet = <TRecord extends LatticeSnapshotRecord>(records: readonly TRecord[]): ReadonlySet<string> => {
  return new Set(records.map((record) => resolveRoute(record.routeId)));
};

export const summarizeByRouteAndTenant = <TRecord extends LatticeSnapshotRecord>(
  records: readonly TRecord[],
): Readonly<Record<string, number>> => {
  const map = new Map<string, number>();
  for (const record of records) {
    const key = `${record.tenantId}:${resolveRoute(record.routeId)}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...map.entries()]);
};
