import { Result, ok } from '@shared/result';
import { InMemoryCommandIntelligenceStore } from './store';
import { CommandIntelligenceRecord, CommandRunCursor } from './types';

export interface RunSummary {
  readonly runId: string;
  readonly status: string;
  readonly warningCount: number;
  readonly eventCount: number;
  readonly updatedAt: string;
}

const safeFinite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const collectRunSummaries = (records: readonly CommandIntelligenceRecord[]): readonly RunSummary[] =>
  records.map((record) => ({
    runId: record.runId,
    status: record.result.status,
    warningCount: record.result.warnings.length,
    eventCount: record.events.length,
    updatedAt: record.updatedAt,
  }));

export const paginateRuns = async (
  store: InMemoryCommandIntelligenceStore,
  cursor: CommandRunCursor,
): Promise<Result<{ readonly items: readonly RunSummary[]; readonly hasMore: boolean; readonly nextCursor: string }>> => {
  const rows = await store.queryByTenant(cursor.tenantId);
  const start = rows.findIndex((row) => row.updatedAt >= cursor.cursor) + 1;
  const index = start >= 0 ? start : 0;
  const items = collectRunSummaries(rows.slice(index, index + cursor.limit));
  const hasMore = rows.length > index + cursor.limit;
  const next = rows[index + cursor.limit - 1]?.updatedAt ?? '';

  return ok({
    items,
    hasMore,
    nextCursor: next,
  });
};

export const topErrorRate = (records: readonly CommandIntelligenceRecord[]): readonly string[] => {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.result.status, (counts.get(record.result.status) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([status]) => status);
};

export const meanEventCount = (records: readonly CommandIntelligenceRecord[]): number => {
  if (records.length === 0) return 0;
  const total = records.reduce((acc, row) => acc + row.events.length, 0);
  return total / records.length;
};

export const percentileSignals = (records: readonly CommandIntelligenceRecord[], ratio: number): number => {
  const values = records.map((record) => record.events.length).sort((left, right) => left - right);
  if (!values.length) return 0;
  const normalized = Math.max(0, Math.min(1, ratio));
  const index = Math.min(values.length - 1, Math.floor(values.length * normalized));
  return values[index] ?? 0;
};

export const summarizeByTenant = async (
  store: InMemoryCommandIntelligenceStore,
  tenantId: Parameters<InMemoryCommandIntelligenceStore['queryByTenant']>[0],
): Promise<{ readonly totalRuns: number; readonly avgWarnings: number; readonly topStatus: readonly string[]; readonly p95Events: number }> => {
  const rows = await store.queryByTenant(tenantId);
  const summaries = collectRunSummaries(rows);
  const avgWarnings = summaries.length
    ? safeFinite(summaries.reduce((acc, summary) => acc + summary.warningCount, 0) / summaries.length)
    : 0;

  return {
    totalRuns: summaries.length,
    avgWarnings,
    topStatus: topErrorRate(rows),
    p95Events: percentileSignals(rows, 0.95),
  };
};
