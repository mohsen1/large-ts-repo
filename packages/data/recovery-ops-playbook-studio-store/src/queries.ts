import type { PluginTag, RunId, WorkspaceId } from '@domain/recovery-ops-playbook-studio';
import type { StudioRunRecord } from './models';

export interface SorterState {
  readonly by: 'started' | 'updated' | 'id';
  readonly direction: 'asc' | 'desc';
}

export const normalizeRunQuery = (query: {
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly includeArchived?: boolean;
  readonly tagPrefix?: string;
  readonly limit?: number;
}): {
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly includeArchived: boolean;
  readonly tagPrefix?: string;
  readonly limit: number;
} => ({
  tenantId: query.tenantId,
  workspaceId: query.workspaceId,
  includeArchived: query.includeArchived ?? false,
  tagPrefix: query.tagPrefix,
  limit: Math.max(1, Math.min(query.limit ?? 80, 1000)),
});

export const matchWorkspace = (run: StudioRunRecord, query: {
  tenantId?: string;
  workspaceId?: string;
  tagPrefix?: string;
}): boolean => {
  if (query.tenantId && run.tenantId !== query.tenantId) return false;
  if (query.workspaceId && run.workspaceId !== query.workspaceId) return false;
  if (query.tagPrefix && !`${run.payload?.tag ?? ''}`.startsWith(query.tagPrefix)) return false;
  return true;
};

export const pickLatestRuns = (runs: readonly StudioRunRecord[], limit = 20): readonly StudioRunRecord[] =>
  runs
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 500)));

export const findRunsByTag = (
  runs: readonly StudioRunRecord[],
  tag: PluginTag,
): readonly StudioRunRecord[] =>
  runs.filter((run) => `${run.payload?.tag ?? ''}` === tag);

export const summarizeRuns = (runs: readonly StudioRunRecord[]): {
  readonly total: number;
  readonly active: number;
  readonly failed: number;
  readonly failedByTenant: ReadonlyMap<string, number>;
  readonly newestRun?: StudioRunRecord;
  readonly oldestRun?: StudioRunRecord;
} => {
  const failedByTenant = new Map<string, number>();
  let active = 0;
  let failed = 0;

  for (const run of runs) {
    if (run.status === 'running') {
      active += 1;
    }
    if (run.status === 'failed') {
      failed += 1;
      failedByTenant.set(run.tenantId, (failedByTenant.get(run.tenantId) ?? 0) + 1);
    }
  }
  const ordered = [...runs].toSorted((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  return {
    total: runs.length,
    active,
    failed,
    failedByTenant,
    newestRun: ordered.at(0),
    oldestRun: ordered.at(-1),
  };
};

export const buildRunCursor = (run: StudioRunRecord): string =>
  `${run.tenantId}::${run.workspaceId}::${run.runId}`;

export const parseRunCursor = (cursor: string): { tenantId?: string; workspaceId?: WorkspaceId; runId?: RunId } => {
  const [tenantId, workspaceId, runId] = cursor.split('::');
  return {
    tenantId: tenantId,
    workspaceId: workspaceId ? (workspaceId as WorkspaceId) : undefined,
    runId: runId ? (runId as unknown as RunId) : undefined,
  };
};

export const applySort = (runs: readonly StudioRunRecord[], state: SorterState): readonly StudioRunRecord[] => {
  const sorted = runs.toSorted((left, right) => {
    if (state.by === 'updated') {
      return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    }
    if (state.by === 'id') {
      return left.runId.localeCompare(right.runId);
    }
    return Date.parse(left.startedAt) - Date.parse(right.startedAt);
  });
  return state.direction === 'asc' ? sorted : sorted.toReversed();
};

export const collectTags = (runs: readonly StudioRunRecord[]): readonly string[] => {
  const tags = runs
    .flatMap((run) => `${run.payload?.tag ?? ''}`.split(','))
    .filter(Boolean)
    .map((tag) => tag.trim())
    .toSorted((left, right) => left.localeCompare(right));
  return [...new Set(tags)];
};
