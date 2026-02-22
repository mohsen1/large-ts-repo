import type {
  ForecastInput,
  ScenarioForecast,
  StoredRecord,
  WorkloadStoreQuery,
  WorkloadSnapshot,
  WorkloadTrendPoint,
  WorkloadUnitId,
  WorkloadViewRow,
  WorkloadRepository,
  UpsertWorkloadRecord,
} from './types';
import type { WorkloadDependencyGraph } from '@domain/recovery-workload-intelligence';
import type { Result } from '@shared/result';

const snapshotTimestamp = (snapshot: WorkloadSnapshot): string => snapshot.timestamp;

class InMemoryWorkloadRepository implements WorkloadRepository {
  private readonly records = new Map<WorkloadUnitId, StoredRecord>();

  async upsert(input: UpsertWorkloadRecord): Promise<StoredRecord> {
    const now = new Date().toISOString();
    const existing = this.records.get(input.node.id);
    const updated: StoredRecord = {
      nodeId: input.node.id,
      node: input.node,
      snapshots: input.snapshots,
      forecastHistory: input.forecastHistory,
      lastPlan: input.lastPlan,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    this.records.set(input.node.id, updated);
    return updated;
  }

  async query(request: WorkloadStoreQuery): Promise<readonly StoredRecord[]> {
    const rows = [...this.records.values()].filter((row) => {
      if (request.nodeIds.length > 0 && !request.nodeIds.includes(row.nodeId)) {
        return false;
      }
      if (request.region && row.node.region !== request.region) {
        return false;
      }
      return true;
    });

    return request.includeDependencies
      ? rows
      : [...rows].sort((left, right) => left.node.criticality - right.node.criticality);
  }

  async getForecastSignal(nodeId: WorkloadUnitId): Promise<readonly ScenarioForecast[]> {
    const row = this.records.get(nodeId);
    return row?.forecastHistory ?? [];
  }

  async buildFromInputs(inputs: readonly ForecastInput[]): Promise<readonly StoredRecord[]> {
    return Promise.all(
      inputs.map((input) => {
        const record: UpsertWorkloadRecord = {
          node: input.node,
          snapshots: [input.snapshot],
          forecastHistory: [],
        };
        return this.upsert(record);
      }),
    );
  }
}

export const createWorkloadRepository = (): WorkloadRepository => new InMemoryWorkloadRepository();

export const transformToViewRows = (records: readonly StoredRecord[]): WorkloadViewRow[] =>
  records.map((record) => {
    const latestSnapshot = record.snapshots.at(-1);
    const riskSignal = latestSnapshot
      ? latestSnapshot.cpuUtilization / 100
      : 0;

    return {
      nodeId: record.nodeId,
      nodeName: record.node.name,
      snapshotAt: latestSnapshot?.timestamp ?? record.updatedAt,
      riskSignal,
      activeForecastCount: record.forecastHistory.length,
    };
  });

export const buildTrendSeries = (records: readonly StoredRecord[], graph: WorkloadDependencyGraph): WorkloadTrendPoint[] => {
  const byNode = new Map<WorkloadUnitId, WorkloadSnapshot[]>();
  for (const row of records) {
    byNode.set(row.nodeId, [...row.snapshots]);
  }

  return [...byNode.entries()]
    .map(([nodeId, snapshots]) => {
      const row = records.find((candidate) => candidate.nodeId === nodeId);
      const snapshot = snapshots.at(-1);
      const severity = snapshot ? snapshot.cpuUtilization / 20 : 0;
      const bucket = snapshot ? snapshotTimestamp(snapshot) : new Date().toISOString();
      const criticality = row?.node.criticality ?? 1;
      return {
        bucket,
        value: severity + graph.nodes.length,
        criticality,
      };
    })
    .filter((entry) => entry.value >= 0)
    .sort((left, right) => left.bucket.localeCompare(right.bucket));
};

export const withResult = async <T,>(work: () => Promise<T>): Promise<Result<T, string>> => {
  try {
    const value = await work();
    return {
      ok: true,
      value,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'unknown repository error',
    };
  }
};
