import type { StrategyPlan, StrategyDraft, StrategyTemplate } from '@domain/recovery-orchestration-planning';
import type { StrategyStoreRecord } from './types';

export const buildRecord = (
  tenantId: string,
  plan: StrategyPlan,
  draft: StrategyDraft,
  template: StrategyTemplate,
): StrategyStoreRecord => ({
  tenantId,
  plan,
  draft,
  template,
  windows: plan.windows,
  commandLog: [],
  updatedAt: new Date().toISOString(),
});

export const planWindowSignals = (record: StrategyStoreRecord): number[] => record.windows.map((window) => window.signalDensity);

export const planWindowMinutes = (record: StrategyStoreRecord): number =>
  record.windows.reduce((sum, window) => sum + window.expectedRto, 0);

export const formatPlanDigest = (record: StrategyStoreRecord): string =>
  `${record.plan.strategyId}@${record.tenantId} windows=${record.windows.length}`;

export const mergeRecordsByTenant = (records: readonly StrategyStoreRecord[]): ReadonlyMap<string, readonly StrategyStoreRecord[]> => {
  const map = new Map<string, StrategyStoreRecord[]>();
  for (const record of records) {
    map.set(record.tenantId, [...(map.get(record.tenantId) ?? []), record]);
  }
  return map;
};
