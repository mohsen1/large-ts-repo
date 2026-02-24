import { latticeBatchSchema, latticeSignalSchema, safeValidateSignal, type LatticeBatchInput, type LatticeSignalSchemaOutput } from './schema';
import { fail, ok, type Result } from '@shared/result';
import { asSnapshotId, asStreamId, asTenantId, asZoneId } from '@domain/recovery-lattice';
import { blankTopology } from './models';
import type { LatticeBatchRequest, LatticeBatchResult, LatticeSignalEvent } from './models';

export const validateBatch = async (batch: unknown): Promise<Result<LatticeBatchRequest, string>> => {
  const parsed = await latticeBatchSchema.safeParseAsync(batch);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((issue: { message: string }) => issue.message).join('|'));
  }

  const tenantId = asTenantId(parsed.data.tenantId);
  const streamId = asStreamId(parsed.data.streamId);
  const topology = (parsed.data.topology?.streamId ? parsed.data.topology : blankTopology(streamId)) as LatticeBatchRequest['topology'];
  const records = parsed.data.records.map((record: LatticeSignalSchemaOutput) => ({
    ...record,
    tenantId: asTenantId(record.tenantId),
    streamId: asStreamId(record.streamId),
    zoneId: asZoneId(record.zoneId),
  }));

  return ok({
    tenantId,
    streamId,
    topology,
    records,
    tags: parsed.data.tags,
  });
};

export const validateBatchSync = (batch: LatticeBatchInput): LatticeBatchRequest => {
  const parsed = latticeBatchSchema.parse(batch);
  const tenantId = asTenantId(parsed.tenantId);
  const streamId = asStreamId(parsed.streamId);
  const records = parsed.records.map((record: LatticeSignalSchemaOutput) => ({
    ...record,
    tenantId: asTenantId(record.tenantId),
    streamId: asStreamId(record.streamId),
    zoneId: asZoneId(record.zoneId),
  }));
  return {
    tenantId,
    streamId,
    topology: (parsed.topology?.streamId ? parsed.topology : blankTopology(streamId)) as LatticeBatchRequest['topology'],
    records,
    tags: parsed.tags,
  };
};

export const validateSignalSafe = (signal: unknown): Result<LatticeSignalEvent, string> => {
  const parsed = safeValidateSignal(signal);
  return parsed.success
    ? ok({
        ...parsed.data,
        tenantId: asTenantId(parsed.data.tenantId),
      zoneId: asZoneId(parsed.data.zoneId),
      streamId: asStreamId(parsed.data.streamId),
    })
    : fail(parsed.error.issues.map((issue: { message: string }) => issue.message).join('|'));
};

export const validateBatchEnvelope = (payload: { topology: unknown; records: readonly LatticeSignalSchemaOutput[] }) => {
  const topology = payload.topology && typeof payload.topology === 'object' ? payload.topology : blankTopology('stream://unknown');
  return { ...payload, topology };
};

export const validateLatticeRunResult = (accepted: number, rejected: number): LatticeBatchResult => ({
  snapshotId: asSnapshotId(`snapshot:${Date.now().toString(36)}`),
  windowId: `${`stream://recovery-lattice-store`}:window:${Math.floor(Date.now() / 60_000)}`,
  accepted,
  rejected,
});
