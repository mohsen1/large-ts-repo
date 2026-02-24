import { createAnalytics, type HorizonStoreRecord } from '@data/recovery-horizon-store';
import { createRepository, type HorizonReadResult, type HorizonLookupConfig } from '@data/recovery-horizon-store';
import type { PluginStage, JsonLike, TimeMs, RunId, HorizonSignal } from '@domain/recovery-horizon-engine';
import { err, ok, type Result } from '@shared/result';
import { horizonBrand } from '@domain/recovery-horizon-engine';

export type MetricWindow = {
  readonly tenantId: string;
  readonly windowFrom: TimeMs;
  readonly windowTo: TimeMs;
  readonly rows: readonly HorizonStoreRecord[];
};

export interface TimelineDigest {
  readonly tenantId: string;
  readonly records: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly runIds: readonly RunId[];
}

export interface TrendPoint {
  readonly stage: PluginStage;
  readonly rank: number;
  readonly frequency: number;
}

export interface MeshSnapshot {
  readonly tenantId: string;
  readonly totals: number;
  readonly trend: readonly TrendPoint[];
  readonly digest: TimelineDigest;
}

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

const aggregateByStage = (rows: readonly HorizonStoreRecord[]): { [K in PluginStage]: number } => {
  return rows.reduce((acc, row) => {
    acc[row.signal.kind] = (acc[row.signal.kind] ?? 0) + 1;
    return acc;
  }, {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  } as { [K in PluginStage]: number });
};

const sortedTrend = (values: Record<PluginStage, number>): readonly TrendPoint[] =>
  (Object.entries(values) as [PluginStage, number][])
    .sort((left, right) => right[1] - left[1])
    .map(([stage, frequency], rank) => ({ stage, rank, frequency }));

export const computeDigest = (rows: readonly HorizonStoreRecord[]): TimelineDigest => {
  const records = rows.map((row) => row.signal);
  const runIds = [...new Set(records.map((entry) => entry.input.runId))] as readonly RunId[];
  return {
    tenantId: rows[0]?.tenantId ?? 'tenant-001',
    records,
    runIds,
  };
};

export const snapshotMetrics = async (
  tenantId: string,
  config: Partial<HorizonLookupConfig> = {},
): Promise<Result<MeshSnapshot>> => {
  const repository = createRepository(tenantId);
  const analytics = createAnalytics(repository);

  const read = await repository.read({
    tenantId,
    stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
    maxRows: 500,
    ...config,
  });

  if (!read.ok) {
    return err(read.error);
  }

  const matrix = aggregateByStage(read.value.items);
  const trend = sortedTrend(matrix);
  const byRuns = await analytics.summarizeStages(tenantId, {
    tenantId,
    maxRows: 500,
    stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  });
  if (!byRuns.ok) {
    return err(byRuns.error);
  }

  return ok({
    tenantId,
    totals: byRuns.value.total,
    trend,
    digest: computeDigest(read.value.items),
  });
};

export const collectTimelineWindows = async (
  tenantId: string,
): Promise<Result<readonly MetricWindow[]>> => {
  const repository = createRepository(tenantId);
  const analytics = createAnalytics(repository);
  const first = await analytics.summarizeStages(tenantId, { tenantId, maxRows: 200 });
  if (!first.ok) {
    return err(first.error);
  }

  const history = await repository.history({ tenantId, maxRows: 200 });
  if (!history.ok) {
    return err(history.error);
  }

  const eventsByTenant = history.value.events.map((event) => event.at);
  const window = eventsByTenant.length
    ? { min: eventsByTenant[0], max: eventsByTenant[eventsByTenant.length - 1] }
    : { min: now(), max: now() };

  const read = await repository.read({
    tenantId,
    maxRows: 200,
    stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  });
  if (!read.ok) {
    return err(read.error);
  }

  return ok([{
    tenantId,
    windowFrom: window.min,
    windowTo: window.max,
    rows: read.value.items,
  }]);
};

export const foldSnapshot = async (
  tenantId: string,
): Promise<Result<{ readonly tenantId: string; readonly signature: string }>> => {
  const snapshot = await snapshotMetrics(tenantId);
  if (!snapshot.ok) {
    return err(snapshot.error);
  }
  const signature = `${snapshot.value.tenantId}|${snapshot.value.totals}|${snapshot.value.trend.length}`;
  return ok({ tenantId: snapshot.value.tenantId, signature });
};
