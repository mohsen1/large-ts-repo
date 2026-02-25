import type { ExperimentRecord, ExperimentRecordFilter, ExperimentRecordStatus, ExperimentRunId } from './types';

export interface SearchDescriptor<T> {
  readonly value: T;
  readonly ops: readonly {
    readonly op: 'eq' | 'contains' | 'prefix';
    readonly value: string;
  }[];
}

const parseCursor = (cursor?: string): number => {
  if (!cursor) {
    return 0;
  }
  const index = Number(cursor.split(':')[1] ?? 0);
  return Number.isFinite(index) ? index : 0;
};

export const buildSearchDescriptor = (value: string): SearchDescriptor<string> => ({
  value,
  ops: value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => ({ op: 'contains', value: segment })),
});

export const matchStatus = (status?: ExperimentRecordStatus | readonly ExperimentRecordStatus[]) => {
  if (!status) {
    return new Set<ExperimentRecordStatus>();
  }
  return new Set(Array.isArray(status) ? status : [status]);
};

export const filterRecords = (
  records: readonly ExperimentRecord[],
  filter: ExperimentRecordFilter,
): readonly ExperimentRecord[] => {
  const allowed = matchStatus(filter.status);
  return records.filter((record) => {
    if (filter.tenant && !record.intent.tenantId.includes(filter.tenant)) {
      return false;
    }
    if (filter.runId && filter.runId !== record.runId) {
      return false;
    }
    if (allowed.size > 0 && !allowed.has(record.status)) {
      return false;
    }
    if (filter.dateFrom && record.createdAt < filter.dateFrom) {
      return false;
    }
    if (filter.dateTo && record.createdAt > filter.dateTo) {
      return false;
    }
    return true;
  });
};

export const sortByDate = (records: readonly ExperimentRecord[]): readonly ExperimentRecord[] =>
  [...records].toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

export const runIdFromRecord = (record: ExperimentRecord): ExperimentRunId => record.runId;

export const makeCursor = (runId: string, index: number): string => `${runId}:${index}`;

export const takePage = <T>(rows: readonly T[], cursor?: string): readonly T[] => {
  const start = parseCursor(cursor);
  return rows.slice(start);
};

export const toQueryDescriptor = (query: string): SearchDescriptor<string> => buildSearchDescriptor(query);
