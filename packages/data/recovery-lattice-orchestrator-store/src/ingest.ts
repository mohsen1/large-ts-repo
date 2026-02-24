import { fail, ok, type Result } from '@shared/result';
import type { TopologySnapshot } from '@domain/recovery-lattice';
import { asStreamId, asTenantId, asZoneId } from '@domain/recovery-lattice';
import { blankTopology, LatticeBatchRequest, LatticeBatchResult, LatticeSignalEvent } from './models';
import { validateSignalSafe } from './validation';
import { latticeSignalSchema, type LatticeSignalSchemaOutput } from './schema';
import type { LatticeStoreRepository } from './store';

export interface IngestBatchPayload {
  readonly tenantId: string;
  readonly streamId: string;
  readonly payload: readonly unknown[];
  readonly topology?: Partial<TopologySnapshot>;
}

export const sanitizeBatch = (
  payload: IngestBatchPayload,
): Result<LatticeBatchRequest, string> => {
  if (!payload.payload.length) {
    return fail('empty-payload');
  }

  const tenantId = asTenantId(payload.tenantId);
  const streamId = asStreamId(payload.streamId);
  const records = payload.payload
    .map((entry) => validateSignalSafe(entry))
    .filter((entry): entry is Result<LatticeSignalEvent, string> & { ok: true } => entry.ok)
    .map((entry) => entry.value);

  if (records.length !== payload.payload.length) {
    return fail('invalid-signal-batch');
  }

  return ok({
    tenantId,
    streamId,
    topology: blankTopology(streamId),
    records,
    tags: ['ingest'],
  });
};

export const buildRunManifest = async (
  tenantId: string,
  streamId: string,
  payload: readonly unknown[],
): Promise<readonly LatticeSignalEvent[]> => {
  const parsed: readonly LatticeSignalSchemaOutput[] = await Promise.all(
    payload.map((entry: unknown) => latticeSignalSchema.parseAsync(entry)),
  );
  return parsed.map((entry: LatticeSignalSchemaOutput, index: number) => ({
    tenantId: asTenantId(tenantId),
    streamId: asStreamId(streamId),
    zoneId: asZoneId(`zone://${tenantId}`),
    level: entry.level,
    score: entry.score,
    at: entry.at,
    details: {
      ...entry.details,
      sourceIndex: index,
    },
  }));
};

export const ingestToStore = async (
  repository: LatticeStoreRepository,
  payload: IngestBatchPayload,
): Promise<Result<LatticeBatchResult, string>> => {
  const batch = sanitizeBatch(payload);
  if (!batch.ok) {
    return fail(batch.error);
  }
  const timeline = {
    ...batch.value,
    topology: batch.value.topology ?? blankTopology(batch.value.streamId),
    records: batch.value.records,
  };

  const result = await repository.saveBatch(timeline);
  if (!result.ok) {
    return fail(result.error);
  }

  return ok({
    ...result.value,
    accepted: result.value.accepted,
    rejected: result.value.rejected,
  });
};
