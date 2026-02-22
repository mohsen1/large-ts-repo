import { PlanId, StageGraph } from '@domain/failover-orchestration';
import { Result } from '@shared/result';
import { Merge } from '@shared/type-level';

export type SnapshotStatus = 'draft' | 'active' | 'archived';

export type SortDirection = 'asc' | 'desc';

export interface SnapshotQuery {
  tenantId?: string;
  planId?: PlanId;
  state?: SnapshotStatus;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface SnapshotPage {
  items: StoredSnapshot[];
  nextCursor?: string;
}

export interface FailoverSnapshot {
  id: string;
  planId: PlanId;
  state: SnapshotStatus;
  snapshot: {
    plan: { tenantId: string };
    status: SnapshotStatus;
    graph: StageGraph[];
    createdAt: string;
    updatedAt: string;
  };
}

export interface StoredSnapshot {
  id: string;
  planId: PlanId;
  snapshot: string;
  createdAt: string;
  version: number;
}

export type SnapshotUpdate = Merge<Partial<FailoverSnapshot>, { version: number }>;

export interface SnapshotStoreError {
  kind: 'not-found' | 'conflict' | 'io-error';
  message: string;
}

export type SnapshotStoreResult<T> = Result<T, SnapshotStoreError>;

export interface SnapshotStorePort {
  save(planId: PlanId, payload: string): Promise<SnapshotStoreResult<StoredSnapshot>>;
  get(planId: PlanId): Promise<SnapshotStoreResult<StoredSnapshot | undefined>>;
  list(query: SnapshotQuery): Promise<SnapshotStoreResult<SnapshotPage>>;
  delete(planId: PlanId): Promise<SnapshotStoreResult<void>>;
  patch(planId: PlanId, patch: SnapshotUpdate): Promise<SnapshotStoreResult<StoredSnapshot>>;
}
