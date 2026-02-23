import type {
  ScenarioForecast,
  StoredRecord,
  WorkloadSnapshot,
  WorkloadTrendPoint,
  WorkloadUnitId,
  WorkloadViewRow,
} from './types';
import type { WorkloadDependencyGraph } from '@domain/recovery-workload-intelligence';
import { buildTrendSeries } from './repository';

export interface WorkloadAggregateKey {
  readonly scope: string;
  readonly region: string;
}

export interface WorkloadAggregate {
  readonly key: WorkloadAggregateKey;
  readonly nodeCount: number;
  readonly alertCount: number;
  readonly trend: WorkloadTrendPoint[];
}

export interface SnapshotHistory {
  readonly totalSnapshots: number;
  readonly latestByNode: ReadonlyMap<WorkloadUnitId, WorkloadSnapshot>;
}

const bucketKey = (snapshot: WorkloadSnapshot): string => snapshot.timestamp.slice(0, 13);

export const summarizeForecasts = (forecasts: readonly ScenarioForecast[]): ReadonlyMap<string, number> => {
  const buckets = new Map<string, number>();
  for (const forecast of forecasts) {
    const score = Math.max(0, 100 - forecast.projectedDowntimeMinutes);
    const current = buckets.get(forecast.nodeId) ?? 0;
    buckets.set(forecast.nodeId, Math.max(current, score));
  }
  return buckets;
};

export const aggregateByScope = (
  records: readonly StoredRecord[],
): readonly WorkloadAggregate[] => {
  const grouped = new Map<string, { scope: string; region: string; records: StoredRecord[] }>();
  for (const record of records) {
    const scope = record.node.team;
    const region = record.node.region;
    const key = `${scope}::${region}`;
    const group = grouped.get(key) ?? {
      scope,
      region,
      records: [],
    };
    group.records.push(record);
    grouped.set(key, group);
  }

  return [...grouped.values()].map((group) => {
    const trend = group.records.length === 0
      ? []
      : buildTrendSeries(group.records, {
        nodes: group.records.map((record) => record.node),
        edges: [],
      });
    const snapshots = group.records.flatMap((record) => record.snapshots);
    const alertCount = snapshots.filter((snapshot) => snapshot.cpuUtilization > 85 || snapshot.errorRate > 35).length;
    return {
      key: {
        scope: group.scope,
        region: group.region,
      },
      nodeCount: group.records.length,
      alertCount,
      trend,
    };
  });
};

export const computeHistory = (records: readonly StoredRecord[]): SnapshotHistory => {
  const latestByNode = new Map<WorkloadUnitId, WorkloadSnapshot>();
  for (const record of records) {
    const latest = record.snapshots.at(-1);
    if (latest) {
      latestByNode.set(record.nodeId, latest);
    }
  }
  return {
    totalSnapshots: [...latestByNode.values()].length,
    latestByNode,
  };
};

export const toViewRows = (
  records: readonly StoredRecord[],
): WorkloadViewRow[] => {
  const rows = records.flatMap((record) => {
    const bucket = new Map<string, WorkloadSnapshot[]>();
    for (const snapshot of record.snapshots) {
      const key = bucketKey(snapshot);
      const values = bucket.get(key) ?? [];
      values.push(snapshot);
      bucket.set(key, values);
    }
    return [...bucket.values()].map((snapshots) => ({
      nodeId: record.nodeId,
      nodeName: record.node.name,
      snapshotAt: snapshots.at(-1)?.timestamp ?? record.updatedAt,
      riskSignal: snapshots.reduce((acc, snapshot) => acc + snapshot.cpuUtilization / 100, 0) / snapshots.length,
      activeForecastCount: record.forecastHistory.length,
    }));
  });
  return rows.sort((left, right) => right.riskSignal - left.riskSignal);
};
