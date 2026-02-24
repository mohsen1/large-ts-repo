import {
  type LatticeStoreAggregate,
  type LatticeStoreQuery,
  type LatticeSessionRecord,
  type LatticeRecordStore,
} from './models';
import { type Brand, PathValue, type NoInfer } from '@shared/type-level';
import { MemoryStressLabOrchestrationStore, LatticeStoreManager } from './store';

export interface LatticeAggregateSnapshot {
  readonly aggregate: LatticeStoreAggregate;
  readonly key: string;
  readonly window: {
    readonly from: string;
    readonly to: string;
  };
}

export interface LatticeSignalMatrix {
  readonly tenantId: string;
  readonly timeline: readonly { readonly at: string; readonly score: number; readonly signalCount: number }[];
}

const matrixCache = new WeakMap<LatticeSessionRecord, LatticeSignalMatrix>();

const toKey = (query: NoInfer<LatticeStoreQuery>): string => {
  const from = query.from ?? 'all';
  const to = query.to ?? 'now';
  const tenant = query.tenantId ?? ('all' as Brand<string, 'TenantId'>);
  const status = query.runStatus?.join(',') ?? 'any';
  return `${tenant}:${from}:${to}:${status}`;
};

export const snapshotAggregate = async (
  store: LatticeRecordStore,
  query: LatticeStoreQuery,
): Promise<LatticeAggregateSnapshot> => {
  const sessions = await store.listSessions(query);
  const aggregate = sessions.reduce<LatticeStoreAggregate>(
    (acc, session) => ({
      tenantCount: acc.tenantCount + (session.tenantId === query.tenantId || !query.tenantId ? 1 : 0),
      runCount: acc.runCount + 1,
      completedCount: acc.completedCount + (session.status === 'completed' ? 1 : 0),
      activeSignalCount: acc.activeSignalCount + session.signals.length,
      avgScore: (acc.avgScore + session.simulation.ticks.reduce((sum, tick) => sum + tick.confidence, 0)) /
        (session.simulation.ticks.length + 1),
      avgLatencyMs: acc.avgLatencyMs + (session.status === 'failed' ? 200 : 100),
    }),
    { tenantCount: 0, runCount: 0, completedCount: 0, activeSignalCount: 0, avgScore: 0, avgLatencyMs: 0 },
  );

  return {
    aggregate,
    key: toKey(query),
    window: {
      from: query.from ?? 'epoch',
      to: query.to ?? new Date().toISOString(),
    },
  };
};

export const buildSignalTimeline = async (
  sessions: readonly LatticeSessionRecord[],
  limit = 120,
): Promise<LatticeSignalMatrix> => {
  const points = sessions
    .toSorted((left, right) => left.metadata.startedAt.localeCompare(right.metadata.startedAt))
    .flatMap((session) => session.simulation.ticks.map((tick) => ({
      at: session.metadata.startedAt,
      score: tick.confidence,
      signalCount: tick.blockedWorkloads.length,
    })))
    .slice(0, limit);

  return {
    tenantId: sessions[0]?.tenantId ? String(sessions[0].tenantId) : 'unknown',
    timeline: points,
  };
};

export const extractTenantSignalPath = <TModel>(model: TModel): PathValue<TModel, 'simulation.simulationState'> => {
  const value = model as Record<string, Record<string, unknown>>;
  return value.simulation?.simulationState as PathValue<TModel, 'simulation.simulationState'>;
};

export const extractPathTuples = (pathCount = 4): readonly string[] => {
  const tuples: string[] = [];
  const keys = ['simulation', 'plan', 'status', 'metadata', 'targets'] as const satisfies readonly string[];

  for (let index = 0; index < pathCount; index += 1) {
    const prefix = keys[index % keys.length];
    const suffix = index < 2 ? 'score' : index < 3 ? 'digest' : index < 4 ? 'startedAt' : 'tenant';
    tuples.push(`${prefix}.${suffix}`);
  }
  return tuples;
};

export const createManager = (): LatticeStoreManager => new LatticeStoreManager();

export { MemoryStressLabOrchestrationStore };
