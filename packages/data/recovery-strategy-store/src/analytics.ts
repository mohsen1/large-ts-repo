import type { StrategyStoreRecord, StrategyStoreMetrics } from './types';

export const computeMetrics = (records: readonly StrategyStoreRecord[]): StrategyStoreMetrics => {
  const commandCounts = records.map((record) => record.commandLog.length);
  const totalPlans = records.length;
  const totalDrafts = records.filter((record) => record.draft.template.templateId.length > 0).length;
  const eventCount = records.reduce((sum, record) => sum + record.commandLog.length, 0);

  return {
    totalPlans,
    totalDrafts,
    averageCommandCount: commandCounts.length === 0 ? 0 : commandCounts.reduce((sum, value) => sum + value, 0) / commandCounts.length,
    eventCount,
  };
};

export const summarizeWindows = (records: readonly StrategyStoreRecord[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const record of records) {
    out[record.tenantId] = (out[record.tenantId] ?? 0) + record.windows.length;
  }
  return out;
};
