import type { SimulationHistoryItem, SimulationQueryFilter, SimulationRunRecord, SimulationMetricId } from './models';
import type { RecoverySimulationMetricsRepository } from './repository';

export interface SimulationAnalyticsWindow {
  readonly scoreP50: number;
  readonly scoreP95: number;
  readonly best: SimulationHistoryItem | undefined;
  readonly worst: SimulationHistoryItem | undefined;
  readonly count: number;
}

const percentile = (numbers: readonly number[], percentileRank: number) => {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(percentileRank * sorted.length)));
  return sorted[index] ?? 0;
};

export const foldHistory = (items: readonly SimulationHistoryItem[]): SimulationAnalyticsWindow => {
  const scores = items.map((item) => item.score);
  const count = items.length;
  const best = [...items].sort((left, right) => right.score - left.score)[0];
  const worst = [...items].sort((left, right) => left.score - right.score)[0];

  return {
    scoreP50: percentile(scores, 0.5),
    scoreP95: percentile(scores, 0.95),
    best,
    worst,
    count,
  };
};

export const buildTenantSummary = (records: readonly SimulationRunRecord[]) =>
  records.reduce<Record<string, number>>((acc, record) => {
    const tenant = record.id.split(':')[0] ?? 'unknown';
    acc[tenant] = (acc[tenant] ?? 0) + record.summary.score;
    return acc;
  }, {});

export const normalizeFilter = (filter: SimulationQueryFilter) => ({
  ...filter,
  status: filter.status?.length ? filter.status : undefined,
});

export const queryAcrossTenant = async (
  repo: RecoverySimulationMetricsRepository,
  filter: SimulationQueryFilter,
): Promise<readonly SimulationHistoryItem[]> => {
  const result = await repo.query(filter, 500, undefined);
  if (!result.ok) return [];
  return result.value;
};

export const latestRecordByRun = async (
  repo: RecoverySimulationMetricsRepository,
  runId: string,
): Promise<SimulationHistoryItem | undefined> => {
  const history = await repo.history(runId);
  if (!history.ok) return undefined;
  return history.value[history.value.length - 1];
};

export const getRecordById = async (
  repo: RecoverySimulationMetricsRepository,
  id: SimulationMetricId,
) => {
  return repo.getById(id);
};
