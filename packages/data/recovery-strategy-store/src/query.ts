import type { StrategyStoreRecord, StrategyStoreQuery } from './types';

export const matchesQuery = (record: StrategyStoreRecord, query: StrategyStoreQuery): boolean => {
  if (query.tenantIds.length > 0 && !query.tenantIds.includes(record.tenantId)) {
    return false;
  }
  if (query.templateId && record.template.templateId !== query.templateId) {
    return false;
  }
  if (!query.includeCompleted && record.draft.stepsWindow.length === 0) {
    return false;
  }
  return true;
};

export const countPlansByTenant = (records: readonly StrategyStoreRecord[]): ReadonlyMap<string, number> => {
  const map = new Map<string, number>();
  for (const record of records) {
    map.set(record.tenantId, (map.get(record.tenantId) ?? 0) + 1);
  }
  return map;
};
