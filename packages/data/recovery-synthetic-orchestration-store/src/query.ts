import type { SyntheticPhase, SyntheticPluginId, SyntheticRunId } from '@domain/recovery-synthetic-orchestration';
import type { NoInfer, RecursivePath } from '@shared/type-level';
import type { SyntheticStoreQuery, SyntheticRunEvent, SyntheticRunRecord } from './models';

export type SortDirection = 'asc' | 'desc';
export type QueryPath<T> = RecursivePath<T>;

export interface RunSortDescriptor<TPayload> {
  readonly key: QueryPath<TPayload>;
  readonly direction: SortDirection;
}

export interface RunCursor {
  readonly anchor: string;
  readonly direction: SortDirection;
  readonly limit: number;
}

const asDirection = (value: string | undefined): SortDirection => {
  return value === 'desc' ? 'desc' : 'asc';
};

export const buildRunCursor = (
  cursor: string | undefined,
  sortDirection: SortDirection,
  limit: number,
): RunCursor => ({
  anchor: cursor ?? `${Date.now()}`,
  direction: asDirection(sortDirection),
  limit,
});

export const parseRunCursor = (cursor?: string): number => {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const matchesTenant = (record: SyntheticRunRecord, query: NoInfer<SyntheticStoreQuery>): boolean => {
  if (query.tenantId && record.tenantId !== query.tenantId) return false;
  if (query.workspaceId && record.workspaceId !== query.workspaceId) return false;
  if (query.status && record.status !== query.status) return false;
  return true;
};

export const eventMatches = (
  event: SyntheticRunEvent,
  query: NoInfer<SyntheticStoreQuery>,
): boolean => {
  if (query.phase && event.phase !== query.phase) return false;
  if (query.pluginId && event.pluginId !== query.pluginId) return false;
  return true;
};

export const summarizeFilters = (query: SyntheticStoreQuery): readonly string[] =>
  Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);

export const paginateRunIds = (
  ids: readonly SyntheticRunId[],
  query: SyntheticStoreQuery,
): readonly SyntheticRunId[] => {
  const start = parseRunCursor(query.cursor);
  const safeLimit = Math.max(1, Math.min(query.limit ?? 50, 200));
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  return sorted
    .slice(start, start + safeLimit)
    .filter((runId): runId is SyntheticRunId => Boolean(runId));
};

export function buildEventPath(
  runId: SyntheticRunId,
  pluginId: SyntheticPluginId,
  phase: SyntheticPhase,
): string {
  return `${runId}:${pluginId}:${phase}`;
}

export interface EventBucket {
  readonly pluginId: SyntheticPluginId;
  readonly phase: SyntheticPhase;
  readonly count: number;
}

export const bucketByPhase = (events: readonly SyntheticRunEvent[]): readonly EventBucket[] => {
  const groups = new Map<string, number>();
  for (const event of events) {
    const key = `${event.pluginId}:${event.phase}`;
    const prior = groups.get(key) ?? 0;
    groups.set(key, prior + 1);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, count]) => {
      const [rawPluginId, rawPhase] = key.split(':');
      const pluginId = (rawPluginId as unknown) as SyntheticPluginId;
      const phase = (rawPhase as unknown) as SyntheticPhase;
      return {
        pluginId,
        phase,
        count,
      } satisfies EventBucket;
    });
};
