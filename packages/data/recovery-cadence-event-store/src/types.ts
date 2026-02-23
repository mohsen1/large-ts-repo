import type {
  CadenceIntent,
  CadenceExecutionEvent,
  CadencePlan,
  CadenceWindow,
  CadenceConstraint,
  CadencePlanSnapshot,
} from '@domain/recovery-cadence-orchestration';

export type CadenceSortOrder = 'asc' | 'desc';

export interface CadenceEventFilters {
  readonly planId?: CadencePlan['id'];
  readonly windowId?: CadenceWindow['id'];
  readonly channel?: CadenceWindow['channel'];
  readonly since?: string;
  readonly until?: string;
  readonly kinds?: readonly CadenceExecutionEvent['kind'][];
}

export interface CadenceQuery {
  readonly owner?: string;
  readonly organizationId?: string;
  readonly status?: CadencePlan['status'];
  readonly channel?: CadenceWindow['channel'];
  readonly includeInactive?: boolean;
  readonly sortBy?: 'createdAt' | 'updatedAt' | 'owner';
  readonly sortOrder?: CadenceSortOrder;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CadenceStoreRecord {
  readonly plan: CadencePlan;
  readonly windows: readonly CadenceWindow[];
  readonly intents: readonly CadenceIntent[];
  readonly constraints: readonly CadenceConstraint[];
  readonly events: readonly CadenceExecutionEvent[];
  readonly snapshots: readonly CadencePlanSnapshot[];
  readonly lastUpdatedAt: string;
}

export interface CadenceStorePage<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}
