import type { IntelligenceRepository, SignalRecord, AggregationInput, RunSnapshotAggregate } from './models';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';

export interface IntelligenceAdapter {
  recordSignal(record: Omit<SignalRecord, 'signalId'>): Promise<Result<string, string>>;
  collectAggregate(input: AggregationInput): Promise<Result<RunSnapshotAggregate, string>>;
}

export class RepositoryAdapter implements IntelligenceAdapter {
  constructor(private readonly repo: IntelligenceRepository) {}

  async recordSignal(record: Omit<SignalRecord, 'signalId'>): Promise<Result<string, string>> {
    try {
      const id = await this.repo.logSignal(record);
      return ok(id);
    } catch (error) {
      return fail((error as Error).message ?? 'SIGNAL_RECORD_FAILED');
    }
  }

  async collectAggregate(input: AggregationInput): Promise<Result<RunSnapshotAggregate, string>> {
    try {
      const aggregate = await this.repo.loadAggregate(input);
      return ok(aggregate);
    } catch {
      return fail('AGGREGATE_FAILED');
    }
  }
}
