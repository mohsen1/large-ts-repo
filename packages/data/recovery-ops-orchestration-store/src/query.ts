import type {
  SurfaceEnvelopeRecord,
  OrchestrationRunRecord,
  QueryResult,
  CommandSurface,
} from './types';

interface FilterState {
  readonly tenantId?: string;
  readonly scenarioId?: string;
  readonly onlySuccessful?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

const buildOffset = (offset = 0): number => {
  if (!Number.isFinite(offset) || offset < 0) {
    return 0;
  }
  return Math.floor(offset);
};

const buildLimit = (limit = 25): number => {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 25;
  }
  return Math.min(200, Math.floor(limit));
};

const withMetadataTrace = (
  label: string,
  value: string,
): { readonly key: string; readonly value: string } => ({
  key: label,
  value,
});

const includeSurfaceMatch = (surface: CommandSurface, filter: FilterState): boolean => {
  if (!filter.tenantId) {
    return true;
  }
  if (surface.tenantId !== filter.tenantId) {
    return false;
  }

  if (!filter.scenarioId) {
    return true;
  }

  return surface.scenarioId === filter.scenarioId;
};

export const filterSurfaceEnvelopes = (
  envelopes: readonly SurfaceEnvelopeRecord[],
  filter: FilterState,
): QueryResult<SurfaceEnvelopeRecord> => {
  const offset = buildOffset(filter.offset);
  const limit = buildLimit(filter.limit);

  const filtered = envelopes.filter((entry) => {
    if (!entry.metadata) {
      return false;
    }

    const trace = withMetadataTrace('generatedBy', entry.generatedBy);
    return (
      includeSurfaceMatch(entry.surface, filter) &&
      (filter.onlySuccessful === undefined || (filter.onlySuccessful ? trace.key === 'generatedBy' : true))
    );
  });

  const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paged = sorted.slice(offset, offset + limit);

  return {
    data: paged,
    total: sorted.length,
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
  };
};

export const filterRunRecords = (
  runs: readonly OrchestrationRunRecord[],
  filter: FilterState,
): QueryResult<OrchestrationRunRecord> => {
  const offset = buildOffset(filter.offset);
  const limit = buildLimit(filter.limit);

  const filtered = runs
    .filter((run) => (filter.scenarioId ? run.result.surface.scenarioId === filter.scenarioId : true))
    .filter((run) => (filter.tenantId ? run.result.surface.tenantId === filter.tenantId : true))
    .filter((run) => (filter.onlySuccessful === undefined ? true : run.result.ok === filter.onlySuccessful));

  const sorted = [...filtered].sort((a, b) => b.runAt.localeCompare(a.runAt));
  return {
    data: sorted.slice(offset, offset + limit),
    total: sorted.length,
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
  };
};
