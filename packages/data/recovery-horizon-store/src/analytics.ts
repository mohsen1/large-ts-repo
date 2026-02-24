import type { NoInfer } from '@shared/type-level';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';
import type {
  HorizonLookupConfig,
  HorizonMutationEvent,
  HorizonReadResult,
  HorizonStoreRecord,
  HorizonHistoryWindow,
} from './types.js';
import type {
  HorizonSignal,
  PluginStage,
  HorizonPlan,
  JsonLike,
  TimeMs,
  PlanId,
  RunId,
} from '@domain/recovery-horizon-engine';
import { horizonBrand } from '@domain/recovery-horizon-engine';
import { createRepository } from './repository.js';
import type { RecoveryHorizonRepository } from './repository.js';

export type TenantWindow = {
  readonly tenantId: string;
  readonly minTime: TimeMs;
  readonly maxTime: TimeMs;
  readonly planCount: number;
  readonly signalCount: number;
};

export type StageWindowMatrix = {
  readonly tenantId: string;
  readonly matrix: Record<PluginStage, number>;
  readonly total: number;
};

export type SnapshotDiff = {
  readonly tenantId: string;
  readonly removedSignals: number;
  readonly addedSignals: number;
  readonly stageDeltas: Record<PluginStage, number>;
};

export type EventCursor = {
  readonly events: readonly HorizonMutationEvent[];
  readonly eventsByStage: Readonly<Record<PluginStage, readonly HorizonMutationEvent[]>>;
  readonly nextCursor: string;
};

export type SignalCursor = {
  readonly runId: RunId;
  readonly planIds: readonly RunId[];
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
};

const nowMs = (): TimeMs => Date.now() as TimeMs;

const defaultWindow = (): HorizonLookupConfig => ({
  tenantId: 'tenant-001',
  includeArchived: false,
  maxRows: 250,
});

const isTenant = (record: HorizonStoreRecord, tenantId: string): boolean => record.tenantId === tenantId;

export interface RepositoryAnalytics {
  readTenantWindow(tenantId: string, config?: Partial<HorizonLookupConfig>): Promise<Result<TenantWindow>>;
  streamSignals(tenantId: string, maxRows?: number): Promise<Result<SignalCursor>>;
  summarizeStages(tenantId: string, config?: Partial<HorizonLookupConfig>): Promise<Result<StageWindowMatrix>>;
  diffHistory(left: HorizonHistoryWindow, right: HorizonHistoryWindow): Result<SnapshotDiff>;
  collectMutationEvents(config: HorizonLookupConfig): Promise<Result<EventCursor>>;
}

const toMatrix = (rows: readonly HorizonStoreRecord[]): StageWindowMatrix => {
  const total = rows.length;
  const matrix = rows.reduce<Record<PluginStage, number>>((acc, entry) => {
    acc[entry.signal.kind] = (acc[entry.signal.kind] ?? 0) + 1;
    return acc;
  }, {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  });

  return {
    tenantId: rows[0]?.tenantId ?? 'tenant-001',
    matrix,
    total,
  };
};

const toCursor = (events: readonly HorizonMutationEvent[]): string => {
  const latest = events[events.length - 1];
  if (!latest) {
    return 'cursor:empty';
  }
  return `cursor:${latest.at}:${events.length}`;
};

const stageList = <T extends readonly HorizonStoreRecord[]>(rows: T): Readonly<PluginStage[]> => {
  return [...new Set(rows.map((entry) => entry.signal.kind))] as Readonly<PluginStage[]>;
};

export const createAnalytics = (repository?: RecoveryHorizonRepository): RepositoryAnalytics => {
  const repo = repository ?? createRepository('tenant-001', 'tenant-002');

  return {
    async readTenantWindow(tenantId, config = {}) {
      const snapshot = await repo.read({ ...defaultWindow(), ...config, tenantId });
      if (!snapshot.ok) {
        return { ok: false, error: snapshot.error };
      }
      const rows = snapshot.value.items.filter((row) => isTenant(row, tenantId));
      if (!rows.length) {
        return err(new Error(`no records for tenant ${tenantId}`));
      }
      return ok({
        tenantId,
        minTime: rows.reduce<TimeMs>((min, row) => (row.updatedAt < min ? row.updatedAt : min), rows[0].updatedAt),
        maxTime: rows.reduce<TimeMs>((max, row) => (row.updatedAt > max ? row.updatedAt : max), rows[0].updatedAt),
        planCount: new Set(rows.map((row) => row.plan?.id)).size,
        signalCount: rows.length,
      });
    },

    async streamSignals(tenantId, maxRows = 500) {
      const stream = await repo.streamSignals({ tenantId, maxRows, includeArchived: true, stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] });
      if (!stream.ok) {
        return { ok: false, error: stream.error };
      }

      const collect = async <T>(values: AsyncIterable<T>): Promise<T[]> => {
        const out: T[] = [];
        for await (const value of values) {
          out.push(value);
        }
        return out;
      };

      const signals = await collect(stream.value);
      return ok({
        runId: horizonBrand.fromRunId(`analytics:${tenantId}:${Date.now()}`),
        planIds: [...new Set(signals.map((signal) => signal.input.runId))],
        signals: signals as readonly HorizonSignal<PluginStage, JsonLike>[],
      });
    },

    async summarizeStages(tenantId, config = {}) {
      const read = await repo.read({ ...defaultWindow(), ...config, tenantId });
      if (!read.ok) {
        return { ok: false, error: read.error };
      }

      const matrix = toMatrix(read.value.items);
      const stages = stageList(read.value.items);
      return ok({
        ...matrix,
        tenantId,
        matrix: {
          ...matrix.matrix,
          ...stages.reduce<Record<PluginStage, number>>((acc, stage) => {
            acc[stage] = matrix.matrix[stage];
            return acc;
          }, {
            ingest: 0,
            analyze: 0,
            resolve: 0,
            optimize: 0,
            execute: 0,
          }),
        },
      });
    },

    diffHistory(left, right) {
      const leftMap = new Map<string, HorizonMutationEvent>(
        left.events.map((entry) => [`${entry.planId}:${entry.kind}:${entry.at}`, entry]),
      );
      const rightMap = new Map<string, HorizonMutationEvent>(
        right.events.map((entry) => [`${entry.planId}:${entry.kind}:${entry.at}`, entry]),
      );
      const removed = [...leftMap.values()].filter((entry) => !rightMap.has(`${entry.planId}:${entry.kind}:${entry.at}`)).length;
      const added = [...rightMap.values()].filter((entry) => !leftMap.has(`${entry.planId}:${entry.kind}:${entry.at}`)).length;

      const stageDeltas = (left.events.concat(right.events)).reduce<Record<PluginStage, number>>((acc, event) => {
        const stage = event.kind === 'upsert' ? 'ingest' : event.kind === 'delete' ? 'optimize' : 'resolve';
        acc[stage] = (acc[stage] ?? 0) + 1;
        return acc;
      }, {
        ingest: 0,
        analyze: 0,
        resolve: 0,
        optimize: 0,
        execute: 0,
      });

      return {
        ok: true,
        value: {
          tenantId: right.events[0]?.tenantId ?? left.events[0]?.tenantId ?? 'tenant-001',
          removedSignals: removed,
          addedSignals: added,
          stageDeltas,
        },
      };
    },

    async collectMutationEvents(config) {
      const history = await repo.history(config);
      if (!history.ok) {
        return { ok: false, error: history.error };
      }
      const staged = history.value.events.reduce<Record<PluginStage, HorizonMutationEvent[]>>(
        (acc, entry) => {
          const stage = (entry.kind === 'upsert' ? 'ingest' : entry.kind === 'delete' ? 'analyze' : 'resolve') as PluginStage;
          const bucket = acc[stage] ?? [];
          bucket.push(entry);
          acc[stage] = bucket;
          return acc;
        },
        {
          ingest: [],
          analyze: [],
          resolve: [],
          optimize: [],
          execute: [],
        },
      );

      return ok({
        events: history.value.events,
        eventsByStage: staged,
        nextCursor: toCursor(history.value.events),
      } satisfies EventCursor);
    },
  };
};

export const createTenantWindow = async (
  repository: RecoveryHorizonRepository,
  tenantId: string,
  config: Partial<HorizonLookupConfig> = {},
): Promise<Result<TenantWindow>> => {
  const analytics = createAnalytics(repository);
  return analytics.readTenantWindow(tenantId, config);
};

export const compareAnalytics = (left: StageWindowMatrix, right: StageWindowMatrix) => {
  const deltas = {
    tenantId: right.tenantId,
    total: right.total - left.total,
    stages: Object.keys(right.matrix).reduce<Record<PluginStage, number>>((acc, stage) => {
      const key = stage as PluginStage;
      acc[key] = right.matrix[key] - left.matrix[key];
      return acc;
    }, {
      ingest: 0,
      analyze: 0,
      resolve: 0,
      optimize: 0,
      execute: 0,
    }),
  } as const;

  return deltas;
};

export type AggregateRows<TRows extends readonly HorizonStoreRecord[]> = {
  readonly rows: TRows;
  readonly window: TenantWindow;
  readonly matrix: StageWindowMatrix;
};

export const collectAggregate = async <TRows extends readonly HorizonStoreRecord[]>(
  rows: NoInfer<TRows>,
): Promise<AggregateRows<TRows>> => {
  const byTenant = [...new Set(rows.map((row) => row.tenantId))][0] ?? 'tenant-001';
  const matrix = toMatrix(rows);
  const window: TenantWindow = {
    tenantId: byTenant,
    minTime: rows.reduce<TimeMs>((acc, row) => (row.updatedAt < acc ? row.updatedAt : acc), nowMs()),
    maxTime: rows.reduce<TimeMs>((acc, row) => (row.updatedAt > acc ? row.updatedAt : acc), 0 as TimeMs),
    planCount: rows.length,
    signalCount: rows.length,
  };

  return {
    rows,
    window,
    matrix,
  };
};
