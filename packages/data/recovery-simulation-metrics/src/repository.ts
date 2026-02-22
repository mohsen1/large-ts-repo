import { fail, ok, type Result } from '@shared/result';

import type {
  SimulationHistoryItem,
  SimulationMetricId,
  SimulationQueryFilter,
  SimulationRunRecord,
} from './models';

export interface SimulationMetricsSnapshot {
  readonly items: readonly SimulationRunRecord[];
  readonly total: number;
}

export interface RecoverySimulationMetricsRepository {
  save(record: SimulationRunRecord): Promise<Result<boolean, Error>>;
  append(record: SimulationRunRecord): Promise<Result<boolean, Error>>;
  getById(id: SimulationMetricId): Promise<Result<SimulationRunRecord | undefined, Error>>;
  query(filter: SimulationQueryFilter, limit?: number, cursor?: string): Promise<Result<SimulationHistoryItem[], Error>>;
  history(runId: string): Promise<Result<readonly SimulationHistoryItem[], Error>>;
}

export class InMemorySimulationMetricsRepository implements RecoverySimulationMetricsRepository {
  private readonly records = new Map<SimulationMetricId, SimulationRunRecord>();

  async save(record: SimulationRunRecord): Promise<Result<boolean, Error>> {
    this.records.set(record.id, record);
    return ok(true);
  }

  async append(record: SimulationRunRecord): Promise<Result<boolean, Error>> {
    const existing = this.records.get(record.id);
    if (!existing) {
      this.records.set(record.id, record);
      return ok(true);
    }

    const merged: SimulationRunRecord = {
      ...existing,
      summary: record.summary,
      samples: [...existing.samples, ...record.samples],
      violations: [...existing.violations, ...record.violations],
      completedAt: record.completedAt,
    };
    this.records.set(record.id, merged);
    return ok(true);
  }

  async getById(id: SimulationMetricId): Promise<Result<SimulationRunRecord | undefined, Error>> {
    return ok(this.records.get(id));
  }

  async query(
    filter: SimulationQueryFilter,
    limit = 50,
    cursor?: string,
  ): Promise<Result<SimulationHistoryItem[], Error>> {
    const all = [...this.records.values()]
      .filter((record) => {
        if (filter.tenant && !record.id.includes(filter.tenant)) return false;
        if (filter.runIds && !filter.runIds.includes(record.runId)) return false;
        if (filter.status && !filter.status.includes(record.summary.status)) return false;
        if (filter.minScore !== undefined && record.summary.score < filter.minScore) return false;
        if (filter.from && record.startedAt < filter.from) return false;
        if (filter.to && record.completedAt > filter.to) return false;
        return true;
      })
      .filter((record) => {
        if (!cursor) return true;
        return record.id > cursor;
      })
      .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
      .slice(0, limit);

    return ok(
      all.map((record) => ({
        runId: record.runId,
        score: record.summary.score,
        readinessState: record.summary.readinessState,
        summary: record.summary,
        generatedAt: record.completedAt,
      })),
    );
  }

  async history(runId: string): Promise<Result<readonly SimulationHistoryItem[], Error>> {
    const list = [...this.records.values()]
      .filter((record) => record.runId === (runId as any))
      .map((record) => ({
        runId: record.runId,
        score: record.summary.score,
        readinessState: record.summary.readinessState,
        summary: record.summary,
        generatedAt: record.completedAt,
      }))
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    return ok(list);
  }
}
