import type { DrillRunEnvelope, DrillRunQuery, DrillRunSnapshot, DrillWorkspace } from '@domain/recovery-drill-lab';

export interface RunFilterWindow {
  readonly total: number;
  readonly from?: string;
  readonly to?: string;
}

export const matchStatuses = (run: DrillRunSnapshot, statuses?: readonly string[]): boolean =>
  !statuses?.length ? true : statuses.includes(run.status);

export const runMatchesQuery = (run: DrillRunSnapshot, query: DrillRunQuery): boolean => {
  if (query.workspaceId && run.workspaceId !== query.workspaceId) {
    return false;
  }
  if (query.scenarioId && run.scenarioId !== query.scenarioId) {
    return false;
  }
  if (!matchStatuses(run, query.status)) {
    return false;
  }
  if (query.priority && query.priority !== run.priority) {
    return false;
  }
  if (query.from && run.updatedAt < query.from) {
    return false;
  }
  if (query.to && run.updatedAt > query.to) {
    return false;
  }
  return true;
};

export const paginateRunEnvelopes = (
  values: readonly DrillRunEnvelope<DrillRunSnapshot>[],
  query: DrillRunQuery,
  limit?: number,
  cursor?: string,
): { data: readonly DrillRunEnvelope<DrillRunSnapshot>[]; cursor?: string; hasMore: boolean } => {
  const filtered = values
    .filter((item) => runMatchesQuery(item.payload, query))
    .sort((left, right) => right.indexedAt.localeCompare(left.indexedAt));

  const start = cursor ? filtered.findIndex((item) => item.payload.id === cursor) + 1 : 0;
  const safeLimit = typeof limit === 'number' ? Math.max(1, limit) : 30;
  const page = filtered.slice(start, start + safeLimit);

  return {
    data: page,
    cursor: page.length ? page[page.length - 1]?.indexedAt : undefined,
    hasMore: start + page.length < filtered.length,
  };
};

export const summarizeRunsByWorkspace = (
  payloads: readonly DrillRunEnvelope<DrillRunSnapshot>[],
): Map<string, number> => {
  const out = new Map<string, number>();
  for (const item of payloads) {
    out.set(item.payload.workspaceId, (out.get(item.payload.workspaceId) ?? 0) + 1);
  }
  return out;
};

export const summarizeRunsByScenario = (
  payloads: readonly DrillRunEnvelope<DrillRunSnapshot>[],
): Map<string, number> => {
  const out = new Map<string, number>();
  for (const item of payloads) {
    out.set(item.payload.scenarioId, (out.get(item.payload.scenarioId) ?? 0) + 1);
  }
  return out;
};

export const workspaceHasTag = (workspace: DrillWorkspace, tag: string): boolean => workspace.metadata.tags.includes(tag);

export const makeRunFilterWindow = (query: Pick<DrillRunQuery, 'from' | 'to'>): RunFilterWindow => {
  const from = query.from;
  const to = query.to;
  return {
    total: 0,
    from,
    to,
  };
};
