import {
  analyzeSignals,
  evaluateQuery,
  fromLookupConfig,
  resolvePage,
  toReadResult,
} from './queries.js';
import {
  createRepository,
  RecoveryHorizonRepository,
  type HorizonStoreRecord,
  type HorizonLookupConfig,
} from './index.js';
import type { HorizonSignal, JsonLike, PluginStage, RunId } from '@domain/recovery-horizon-engine';
import type { HorizonMutationEvent } from './types.js';
import type { HorizonReadResult, HorizonWriteArgs } from './types.js';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';

type MutationAccumulator = {
  readonly kind: HorizonMutationEvent['kind'];
  readonly at: number;
  readonly runId: RunId;
};

type QueryPages = ReturnType<typeof resolvePage>;

export interface StoreSlice {
  readonly tenant: string;
  readonly startedAt: number;
  readonly rows: readonly HorizonStoreRecord[];
  readonly tags: readonly string[];
}

export interface SnapshotWindow {
  readonly from: number;
  readonly to: number;
  readonly rows: readonly HorizonStoreRecord[];
}

export const pickTenantSlice = (rows: readonly HorizonStoreRecord[], tenantId: string): StoreSlice => ({
  tenant: tenantId,
  startedAt: rows.length ? rows[0].updatedAt : Date.now(),
  rows: rows.filter((entry) => entry.tenantId === tenantId),
  tags: ['slice', tenantId, 'snapshot'],
});

export const sliceBySignals = (
  rows: readonly HorizonStoreRecord[],
  stageWindow: readonly PluginStage[],
): readonly HorizonStoreRecord[] =>
  rows.filter((row) => stageWindow.includes(row.signal.kind));

export const paginateTenant = (
  rows: readonly HorizonStoreRecord[],
  tenantId: string,
  page = 0,
  pageSize = 75,
): {
  readonly cursor: string;
  readonly page: number;
  readonly rows: readonly HorizonStoreRecord[];
} => {
  const sliced = pickTenantSlice(rows, tenantId).rows;
  const pages = resolvePage(sliced, pageSize);
  return {
    cursor: pages[page]?.cursor ?? 'cursor:empty',
    page,
    rows: pages[page]?.rows ?? [],
  };
};

const toMutation = (row: HorizonStoreRecord): HorizonMutationEvent => ({
  kind: 'upsert',
  tenantId: row.tenantId,
  planId: row.id,
  runId: row.runId,
  at: row.updatedAt,
});

const createEmpty = (
  tenantId: string,
  query: QueryPages,
): {
  readonly records: readonly HorizonStoreRecord[];
  readonly query: typeof query;
  readonly events: HorizonMutationEvent[];
  readonly signalSummary: ReturnType<typeof analyzeSignals>;
} => ({
  records: [],
  query,
  events: [],
  signalSummary: analyzeSignals([]),
});

export const analyzeSnapshot = async (
  tenantId: string,
  repository: RecoveryHorizonRepository,
): Promise<{
  readonly records: readonly HorizonStoreRecord[];
  readonly query: QueryPages;
  readonly events: HorizonMutationEvent[];
  readonly signalSummary: ReturnType<typeof analyzeSignals>;
}> => {
  const queryConfig: HorizonLookupConfig = {
    tenantId,
    maxRows: 120,
    stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  };
  const queryShape = fromLookupConfig(queryConfig);
  const readResult = await repository.read(queryConfig);
  if (!readResult.ok) {
    return createEmpty(tenantId, []);
  }

  const filtered = readResult.value.items
    .filter((entry) => entry.tenantId === tenantId)
    .slice(0, queryConfig.maxRows ?? 120);
  const queryResult = evaluateQuery(filtered, queryShape);
  const query = queryResult.ok ? resolvePage(queryResult.value.items, queryConfig.maxRows ?? 120) : [];

  return {
    records: filtered,
    query,
    events: filtered.map(toMutation),
    signalSummary: analyzeSignals(filtered.map((entry) => entry.signal)),
  };
};

export const projectSignals = (records: readonly HorizonStoreRecord[]) =>
  records.map((entry) => entry.signal);

export const projectSignalIds = (signals: readonly HorizonSignal<PluginStage, JsonLike>[]) =>
  signals.map((signal) => signal.id);

export const buildSnapshotWindow = (records: readonly HorizonStoreRecord[], now = Date.now()): SnapshotWindow => {
  const dates = records.map((entry) => entry.updatedAt);
  const sorted = [...dates].sort((left, right) => left - right);
  return {
    from: sorted[0] ?? now,
    to: sorted[sorted.length - 1] ?? now,
    rows: records,
  };
};

export const buildSnapshotEnvelope = (records: readonly HorizonStoreRecord[]) => ({
  rows: records,
  cursor: `snapshot:${records.length}`,
});

export const normalizeSlice = (rows: readonly HorizonStoreRecord[]): {
  readonly items: readonly HorizonStoreRecord[];
  readonly total: number;
  readonly cursor: string;
} =>
  toReadResult(rows).ok
    ? ({
        items: rows,
        total: rows.length,
        cursor: `normalized:${rows.length}`,
      } as const)
    : {
        items: [],
        total: 0,
        cursor: 'normalized:empty',
      };

export const reduceMutations = (rows: readonly HorizonStoreRecord[]) => {
  const mutations = rows.reduce<
    Record<string, 'upsert' | 'delete'>
  >((acc, entry) => {
    const previous = acc[entry.id];
    acc[entry.id] = previous ? 'upsert' : 'upsert';
    return acc;
  }, {});

  const counts = Object.values(mutations).reduce<Record<string, number>>((acc, entry) => {
    acc[entry] = (acc[entry] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: Object.keys(mutations).length,
    mutations: counts,
    keys: Object.keys(mutations),
  };
};

export const mergeReadResult = (
  left: Result<{ items: readonly HorizonStoreRecord[]; total: number }>,
  right: Result<{ items: readonly HorizonStoreRecord[]; total: number }>,
) => {
  if (!left.ok) {
    return right;
  }
  if (!right.ok) {
    return left;
  }
  return ok({
    items: [...left.value.items, ...right.value.items],
    total: left.value.total + right.value.total,
  });
};

export const createEmptySnapshot = (tenantId: string): StoreSlice => ({
  tenant: tenantId,
  startedAt: Date.now(),
  rows: [],
  tags: ['empty', tenantId],
});

export const mergeByTenant = (
  left: readonly HorizonStoreRecord[],
  right: readonly HorizonStoreRecord[],
): readonly HorizonStoreRecord[] =>
  [...left, ...right]
    .filter((entry) => entry.tenantId.length > 0)
    .sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt));

export const collectMutations = async (
  repository: RecoveryHorizonRepository,
  tenantId: string,
  args: readonly HorizonWriteArgs[],
): Promise<Result<HorizonMutationEvent[]>> => {
  const history = await repository.history({ tenantId, stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'], maxRows: args.length });
  if (!history.ok) {
    return err(history.error);
  }
  const mutated = history.value.events
    .filter((event) => event.tenantId === tenantId)
    .map((entry) => ({
      kind: entry.kind,
      tenantId: entry.tenantId,
      planId: entry.planId,
      runId: entry.runId,
      at: entry.at,
    }));

  if (mutated.length) {
    return ok(mutated);
  }

  return ok([]);
};

export const summarizeMutationSet = (rows: readonly HorizonStoreRecord[]): {
  readonly total: number;
  readonly stages: readonly PluginStage[];
} => {
  const groups = rows.reduce<Record<PluginStage, number>>((acc, row) => {
    acc[row.signal.kind] = (acc[row.signal.kind] ?? 0) + 1;
    return acc;
  }, { ingest: 0, analyze: 0, resolve: 0, optimize: 0, execute: 0 });

  const stages = Object.entries(groups)
    .filter(([, count]) => count > 0)
    .map(([stage]) => stage as PluginStage);

  return {
    total: rows.length,
    stages,
  };
};
