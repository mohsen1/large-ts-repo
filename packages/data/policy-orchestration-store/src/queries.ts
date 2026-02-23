import { PolicyStoreArtifact, PolicyStoreFilters, PolicyStorePage, PolicyStoreRunRecord } from './types';

export interface ArtifactQuery {
  filters: PolicyStoreFilters;
  pageToken?: string;
  limit: number;
}

export interface RunQuery {
  orchestratorId: string;
  states: readonly PolicyStoreRunRecord['status'][];
  limit: number;
  pageToken?: string;
}

const parseToken = (token?: string): number => {
  if (!token) return 0;
  const parsed = Number(token);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export const paginateArtifacts = (
  items: readonly PolicyStoreArtifact[],
  query: ArtifactQuery,
): PolicyStorePage<PolicyStoreArtifact> => {
  const offset = parseToken(query.pageToken);
  const page = items.slice(offset, offset + query.limit);
  return {
    items: page,
    nextCursor: offset + query.limit < items.length ? String(offset + query.limit) : undefined,
    hasMore: offset + query.limit < items.length,
  };
};

export const paginateRuns = (
  runs: readonly PolicyStoreRunRecord[],
  query: RunQuery,
): PolicyStorePage<PolicyStoreRunRecord> => {
  const filtered = runs.filter((entry) => query.states.length === 0 || query.states.includes(entry.status));
  const offset = parseToken(query.pageToken);
  const page = filtered.slice(offset, offset + query.limit);
  return {
    items: page,
    nextCursor: offset + query.limit < filtered.length ? String(offset + query.limit) : undefined,
    hasMore: offset + query.limit < filtered.length,
  };
};
