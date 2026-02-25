import { type EventRecord, type SearchResult, type StoreQuery } from './types.js';
import { fail, ok, type Result } from '@shared/result';
import { type MeshRunId } from '@shared/recovery-ops-runtime';

const matchesStringList = (actual: string, allow: readonly string[] = []): boolean => {
  return allow.length === 0 || allow.includes(actual);
};

const matchesZone = (record: EventRecord, zones: readonly string[] = []): boolean =>
  matchesStringList(record.zone, zones);

const matchesType = (record: EventRecord, types: readonly string[] = []): boolean =>
  matchesStringList(record.eventType, types);

export const filterRecords = (records: readonly EventRecord[], query: StoreQuery = {}): readonly EventRecord[] => {
  return records.filter((record) => {
    if (query.tenantId && record.tenant.tenantId !== query.tenantId) {
      return false;
    }
    if (query.runId && record.runId !== query.runId) {
      return false;
    }
    if (!matchesZone(record, query.zones ?? [])) {
      return false;
    }
    return matchesType(record, query.eventTypes ?? []);
  });
};

export const summarizeByZone = (records: readonly EventRecord[]): Record<string, number> =>
  records.reduce<Record<string, number>>((acc, record) => {
    acc[record.zone] = (acc[record.zone] ?? 0) + 1;
    return acc;
  }, {});

export const summarizeByType = (records: readonly EventRecord[]): Record<string, number> =>
  records.reduce<Record<string, number>>((acc, record) => {
    acc[record.eventType] = (acc[record.eventType] ?? 0) + 1;
    return acc;
  }, {});

export const takeTop = <T>(records: readonly T[], limit: number): readonly T[] => {
  if (limit <= 0) {
    return [];
  }
  return records.slice(0, limit);
};

export const runSearch = (
  records: readonly EventRecord[],
  query: StoreQuery,
): Result<SearchResult, Error> => {
  const filtered = filterRecords(records, query);
  if (!filtered.length) {
    return fail(new Error('no records found'));
  }

  return ok({
    records: filtered,
    total: filtered.length,
    audit: {
      generatedAt: new Date().toISOString(),
      source: 'recovery-resilience-store',
      meta: {
        runId: query.runId ?? (`seed-run` as MeshRunId),
        startedAt: Date.now(),
        owner: query.tenantId ? `${query.tenantId}` : 'unknown',
        zone: 'core',
        tags: ['query'],
      },
    },
  });
};
