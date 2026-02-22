import { buildAndPersistForecast, MemoryForecastRepository, type ForecastRepository } from '@data/incident-forecast-store';
import { ingestSignals, type IngestedSignalBatch } from '@data/incident-forecast-store';
import { fail, ok, type Result } from '@shared/result';

export interface ProcessorContext {
  readonly repository: ForecastRepository;
}

export const createProcessor = (repository: ForecastRepository = new MemoryForecastRepository()) => {
  const processIncoming = async (payload: unknown): Promise<Result<{ count: number; tenantId: string }, Error>> => {
    const batchResult = ingestSignals(payload);
    if (batchResult.ok === false) {
      return fail(batchResult.error);
    }

    const persisted = await processBatch(repository, batchResult.value);
    if (persisted.ok === false) {
      return fail(persisted.error);
    }

    return ok({ count: batchResult.value.count, tenantId: batchResult.value.tenantId });
  };

  const processBatch = async (repo: ForecastRepository, batch: IngestedSignalBatch) => {
    return buildAndPersistForecast(repo, batch);
  };

  return { processIncoming };
};
