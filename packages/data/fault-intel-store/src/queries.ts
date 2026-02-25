import type { IncidentSignal, TenantId, WorkspaceId } from '@domain/fault-intel-orchestration';
import { createFaultIntelStore } from './repository';
import { createIteratorChain } from '@shared/fault-intel-runtime';

export type QueryOperator = 'eq' | 'gte' | 'lte' | 'contains';
export interface FieldCriteria<T> {
  readonly field: keyof T;
  readonly operator: QueryOperator;
  readonly value: unknown;
}

export type KeyRemap<T> = {
  [K in keyof T as `query:${K & string}`]: T[K];
};

export interface CampaignSignalQuery {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly filters: readonly FieldCriteria<IncidentSignal>[];
  readonly limit?: number;
}

const store = createFaultIntelStore();

const passCriteria = (signal: IncidentSignal, criteria: FieldCriteria<IncidentSignal>): boolean => {
  const value = signal[criteria.field];
  switch (criteria.operator) {
    case 'eq':
      return value === criteria.value;
    case 'gte':
      return typeof value === 'number' && typeof criteria.value === 'number' && value >= criteria.value;
    case 'lte':
      return typeof value === 'number' && typeof criteria.value === 'number' && value <= criteria.value;
    case 'contains':
      return typeof value === 'string' && typeof criteria.value === 'string' && value.includes(criteria.value);
    default:
      return false;
  }
};

export const querySignals = async ({
  tenantId,
  workspaceId,
  filters,
  limit,
}: CampaignSignalQuery): Promise<readonly IncidentSignal[]> => {
  const runs = await store.listRuns(tenantId, workspaceId, {});
  const allSignals = runs.flatMap((run) => run.plan.signals);
  const applyFilters = createIteratorChain(allSignals).filter((signal) => filters.every((criteria) => passCriteria(signal, criteria)));
  return applyFilters
    .take(limit ?? allSignals.length)
    .toArray();
};
