import { type Brand } from '@shared/core';
import { LatticeRunId, LatticeTenantId, type LatticeContext, LatticeRouteId } from '@domain/recovery-lattice';

export type LatticeStoreId = Brand<string, 'lattice-store-id'>;

export interface LatticeStoreEvent {
  readonly id: Brand<string, 'lattice-store-event'>;
  readonly runId: LatticeRunId;
  readonly tenantId: LatticeTenantId;
  readonly at: string;
  readonly kind: 'snapshot' | 'artifact' | 'plan' | 'error';
  readonly payload: Record<string, unknown>;
}

export interface LatticeSnapshotRecord {
  readonly id: LatticeStoreId;
  readonly routeId: LatticeRouteId;
  readonly tenantId: LatticeTenantId;
  readonly context: LatticeContext;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
  readonly payload: Record<string, unknown>;
  readonly events: readonly LatticeStoreEvent[];
}

export interface LatticeStoreQuery {
  readonly tenantId?: LatticeTenantId;
  readonly routeId?: LatticeRouteId;
  readonly eventKind?: LatticeStoreEvent['kind'];
  readonly fromDate?: string;
  readonly toDate?: string;
}

export interface LatticeStoreCursor {
  readonly id: LatticeStoreId;
  readonly at: string;
}

export interface LatticeStoreResult<T> {
  readonly cursor?: LatticeStoreCursor;
  readonly records: readonly T[];
  readonly next?: LatticeStoreCursor;
  readonly total: number;
}

export interface LatticeStorePage<T> {
  readonly items: readonly T[];
  readonly cursor?: LatticeStoreCursor;
  readonly hasMore: boolean;
  readonly total: number;
}

export interface LatticeStoreOptions {
  readonly namespace: string;
  readonly maxEventsPerRecord: number;
  readonly maxRecordsPerTenant: number;
}

export type StoreTag<K extends string> = `store:${K}`;

export type RecordTuple<T extends readonly LatticeSnapshotRecord[]> =
  T extends readonly [infer H extends LatticeSnapshotRecord, ...infer R extends readonly LatticeSnapshotRecord[]]
    ? readonly [H, ...RecordTuple<R>]
    : readonly [];

export type RecordByTenant<T extends readonly LatticeSnapshotRecord[], TId extends string> =
  T[number] & { tenantId: Brand<TId, 'tenant-id'> };

export type RecordProjection<TRecord, K extends keyof TRecord & string> = {
  readonly [P in K as `projection:${P}`]: TRecord[P];
};
