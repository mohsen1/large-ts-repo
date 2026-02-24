import { NoInfer } from '@shared/type-level';
import {
  InMemoryPolicyStore,
  PolicyStoreArtifact,
  PolicyStoreFilters,
  PolicyStoreRunRecord,
  PolicyStoreSort,
} from './index';

export interface QueryPlan<T> {
  readonly filters: PolicyStoreFilters;
  readonly sort: PolicyStoreSort;
  readonly pageSize: number;
  readonly nextCursor?: string;
  readonly queryHint?: T;
}

export interface QueryEngineSnapshot {
  readonly totalArtifacts: number;
  readonly totalRuns: number;
  readonly windowSizeMs: number;
}

export interface QueryEngineResult<T> {
  readonly items: readonly T[];
  readonly cursor: string;
  readonly hasMore: boolean;
}

export type FilterKey = `filter:${string}`;
export type QueryState<T> = { [K in keyof T as K extends string ? FilterKey : never]: T[K] | undefined };
export type PageCursor<T extends number = 30> = `${T}:${string}`;

type VariadicTuple<T, N extends number, Acc extends T[] = []> =
  Acc['length'] extends N ? Acc : VariadicTuple<T, N, [...Acc, T]>;
export type QueryProjection<T> = {
  [K in keyof T as K extends string ? `col:${K}` : never]: T[K];
};

export interface ArtifactWindow {
  readonly key: string;
  readonly start: string;
  readonly end: string;
}

export interface QueryWindow {
  readonly key: string;
  readonly values: readonly string[];
}

interface AggregatedState {
  readonly active: number;
  readonly archived: number;
  readonly retired: number;
}

const topLevelPage = 60;
const defaultFilters = {
  states: ['active'],
} as const;

type IteratorChain<T> = IterableIterator<T> & {
  map<U>(transform: (value: T) => U): IterableChain<U>;
  filter(predicate: (value: T) => boolean): IterableChain<T>;
  toArray(): T[];
};
type IterableChain<T> = { [K in keyof IteratorChain<T>]: IteratorChain<T>[K] };

const iteratorFrom = <T>(values: Iterable<T>): IterableChain<T> | null =>
  ((globalThis as { Iterator?: { from?: <V>(value: Iterable<V>) => IterableChain<V> } }).Iterator?.from?.(values)) ?? null;

const normalizeState = (state: string | undefined): string =>
  state?.trim().toLowerCase() ?? '';

export const normalizeCursor = <T extends string>(cursor: NoInfer<T>): PageCursor<60> => {
  return `${topLevelPage}:${cursor}` as PageCursor<60>;
};

export const detectWindowBuckets = (runs: readonly PolicyStoreRunRecord[], ms = 60_000): readonly ArtifactWindow[] => {
  const sorted = [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  if (sorted.length === 0) return [];

  const start = new Date(sorted[0]!.createdAt).getTime();
  const end = new Date(sorted[sorted.length - 1]!.createdAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const windows: ArtifactWindow[] = [];
  const normalizedMs = Math.max(5_000, ms);
  for (let cursor = start; cursor < end; cursor += normalizedMs) {
    const windowStart = new Date(cursor).toISOString();
    const windowEnd = new Date(cursor + normalizedMs).toISOString();
    windows.push({ key: `${windowStart}:${windowEnd}`, start: windowStart, end: windowEnd });
  }
  return windows;
};

export const aggregateStateCounts = (artifacts: readonly PolicyStoreArtifact[]): AggregatedState => {
  const totals = artifacts.reduce(
    (acc, artifact) => {
      const next = { ...acc };
      if (artifact.state === 'active') next.active += 1;
      else if (artifact.state === 'archived') next.archived += 1;
      else next.retired += 1;
      return next;
    },
    { active: 0, archived: 0, retired: 0 },
  );
  return totals;
};

export const collectStateFacets = async (store: InMemoryPolicyStore, orchestratorId: string): Promise<QueryEngineSnapshot> => {
  const artifacts = await store.searchArtifacts({ orchestratorId, states: ['active', 'archived', 'retired'] }, {
    key: 'updatedAt',
    order: 'desc',
  });
  const runs = await store.searchRuns(orchestratorId);
  const windows = detectWindowBuckets(runs, 120_000);
  return {
    totalArtifacts: artifacts.length,
    totalRuns: runs.length,
    windowSizeMs: windows.length === 0 ? 0 : windows.at(-1)!.end.length,
  };
};

export const queryArtifactsWithIterator = (
  artifacts: readonly PolicyStoreArtifact[],
  namespace?: string,
): readonly PolicyStoreArtifact[] => {
  const normalized = normalizeState(namespace);
  const cursor = iteratorFrom(artifacts);
  const filtered = cursor
    ? cursor
      .filter((item) => !namespace || item.namespace.includes(normalized))
      .toArray()
    : [...artifacts].filter((item) => !namespace || item.namespace.includes(normalized));
  return filtered.toSorted((left, right) => right.revision - left.revision);
};

export const queryArtifactsByPlanWindow = (
  artifacts: readonly PolicyStoreArtifact[],
  windows: readonly ArtifactWindow[],
): readonly QueryWindow[] => {
  return windows.map((window) => {
    const values = iteratorFrom(artifacts);
    const matched = values
      ? values
        .filter((artifact) => artifact.updatedAt >= window.start && artifact.updatedAt < window.end)
        .map((artifact) => artifact.artifactId)
        .toArray()
      : [...artifacts]
        .filter((artifact) => artifact.updatedAt >= window.start && artifact.updatedAt < window.end)
        .map((artifact) => artifact.artifactId);

    return {
      key: window.key,
      values: matched,
    };
  });
};

export const createQueryPlan = (filters: PolicyStoreFilters, sort: PolicyStoreSort, pageSize = topLevelPage): QueryPlan<string> => ({
  filters,
  sort,
  pageSize,
  nextCursor: normalizeCursor('0'),
  queryHint: `${filters.orchestratorId ?? 'default'}::${sort.key}`,
});

export const executeQueryPlan = async <T extends QueryPlan<string>>(
  store: InMemoryPolicyStore,
  plan: NoInfer<T>,
): Promise<QueryEngineResult<PolicyStoreArtifact>> => {
  const artifacts = await store.searchArtifacts(plan.filters, plan.sort);
  const windowed = detectWindowBuckets(await store.searchRuns(plan.filters.orchestratorId ?? ''));
  const windows = queryArtifactsByPlanWindow(artifacts, windowed);
  const payload = windows.flatMap((window) => window.values.map((artifactId) => artifactId));
  const items = artifacts.filter((artifact) => payload.includes(artifact.artifactId));
  return {
    items,
    cursor: plan.nextCursor ?? '0',
    hasMore: artifacts.length > plan.pageSize,
  };
};

export const summarizeWindowedRuns = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
  bucketMs = 90_000,
): Promise<readonly QueryWindow[]> => {
  const runs = await store.searchRuns(orchestratorId);
  const windows = detectWindowBuckets(runs, bucketMs);
  return queryArtifactsByPlanWindow(
    runs.map((run) => ({
      id: run.id,
      orchestratorId,
      artifactId: run.runId,
      namespace: run.actor,
      name: run.runId,
      revision: run.metrics['revision'] ?? 0,
      state: run.status === 'succeeded' ? 'active' : 'archived',
      payload: {
        runId: run.runId,
        status: run.status,
        actor: run.actor,
        score: run.metrics['score'],
        ...run.summary,
      },
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      correlationId: run.id,
    } satisfies PolicyStoreArtifact)),
    windows,
  );
};
