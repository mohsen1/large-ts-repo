import type { TopologyNode, TopologySnapshot, TopologyEdge } from '@domain/recovery-lattice';
import { asRunId, asSnapshotId, asStreamId, asTenantId, asZoneId, asWindowId, type LatticeZoneId } from '@domain/recovery-lattice';
import { TopologySnapshot as TopologySnapshotCtor, hydrateTopology } from '@domain/recovery-lattice';
import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import type {
  LatticeContext,
  LatticeRunId,
  LatticeStreamId,
  LatticeTenantId,
  LatticeWindowId,
  BrandedTimestamp,
} from '@domain/recovery-lattice';

export type LatticeSignalLevel = 'critical' | 'elevated' | 'normal' | 'low';
export type LatticeSignalTag = `signal:${LatticeSignalLevel}`;

export interface LatticeSignalEvent {
  readonly tenantId: LatticeTenantId;
  readonly zoneId: LatticeZoneId;
  readonly streamId: LatticeStreamId;
  readonly level: LatticeSignalLevel;
  readonly score: number;
  readonly at: string;
  readonly details: Record<string, string | number | boolean>;
}

export interface LatticeEventEnvelope {
  readonly runId: LatticeRunId;
  readonly signal: LatticeSignalEvent;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface LatticeWindow<T = unknown> {
  readonly id: `${string}:window:${number}`;
  readonly streamId: LatticeStreamId;
  readonly start: string;
  readonly end: string;
  readonly buckets: readonly T[];
}

export type LatticeMode = 'analysis' | 'simulation' | 'stress' | 'drill';

export interface LatticeStoreSnapshot {
  readonly id: ReturnType<typeof asSnapshotId>;
  readonly tenantId: LatticeTenantId;
  readonly streamId: LatticeStreamId;
  readonly topology: TopologySnapshot | TopologySnapshotCtor;
  readonly records: readonly LatticeSignalEvent[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LatticeBatchRequest {
  readonly tenantId: LatticeTenantId;
  readonly streamId: LatticeStreamId;
  readonly topology: TopologySnapshot | TopologySnapshotCtor;
  readonly records: readonly LatticeSignalEvent[];
  readonly tags?: readonly string[];
}

export interface LatticeBatchResult {
  readonly snapshotId: ReturnType<typeof asSnapshotId>;
  readonly windowId: `${string}:window:${number}`;
  readonly accepted: number;
  readonly rejected: number;
}

export interface LatticeTimeline {
  readonly tenantId: LatticeTenantId;
  readonly streamId: LatticeStreamId;
  readonly events: readonly LatticeSignalEvent[];
  readonly updatedAt: string;
}

export interface LatticeQuery {
  readonly tenantId?: LatticeTenantId;
  readonly streamId?: LatticeStreamId;
  readonly since?: string;
  readonly until?: string;
}

export interface SeedRecord {
  readonly tenantId: LatticeTenantId;
  readonly seedAt: string;
}

export type TopologyTemplate = {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
};

export const blankTopology = (streamId: string): TopologySnapshot => {
  const snapshot = hydrateTopology([], []);
  return {
    ...snapshot,
    streamId,
  };
};

export const defaultContext = (tenantId: LatticeTenantId): LatticeContext => ({
  tenantId,
  regionId: `region:${tenantId}` as LatticeContext['regionId'],
  zoneId: `zone:${tenantId}` as LatticeContext['zoneId'],
  requestId: withBrand(`trace:${tenantId}:${Date.now().toString(36)}`, 'lattice-trace-id'),
});

const nextWindowBucket = (): number => Math.floor(Date.now() / 60_000);

export const normalizeWindowId = <TContext extends string>(
  streamId: TContext,
  bucket: number,
): `${TContext}:window:${number}` => `${streamId}:window:${bucket}` as `${TContext}:window:${number}`;

export const makeWindow = <T>(streamId: LatticeStreamId, values: readonly T[]): LatticeWindow<T> => {
  const now = Date.now();
  const bucket = nextWindowBucket();
  return {
    id: normalizeWindowId(streamId as string, bucket),
    streamId,
    start: new Date(now - 60_000).toISOString(),
    end: new Date(now).toISOString(),
    buckets: values,
  };
};

export const makeSnapshotId = (seed: string): ReturnType<typeof asSnapshotId> => {
  return asSnapshotId(`snapshot:${seed}:${Date.now().toString(36)}`);
};

export const makeEnvelope = (runId: string, signal: LatticeSignalEvent): LatticeEventEnvelope => ({
  runId: asRunId(runId),
  signal,
  metadata: {
    source: 'recovery-lattice-store',
    stage: signal.level,
  },
});

export const toResult = (
  value: boolean,
  errors: readonly string[],
): Result<LatticeBatchResult, string> => {
  if (!value) return fail('validation-failed');
  const snapshotId = makeSnapshotId('batch');
  return ok({
    snapshotId,
    windowId: normalizeWindowId('stream', 0),
    accepted: value ? 1 : 0,
    rejected: errors.length,
  });
};

export interface StoreEventIterable extends AsyncIterable<LatticeSignalEvent> {
  [Symbol.asyncIterator](): AsyncIterator<LatticeSignalEvent>;
}

export const toTimeline = (request: LatticeBatchRequest): LatticeTimeline => {
  return {
    tenantId: request.tenantId,
    streamId: request.streamId,
    events: request.records,
    updatedAt: new Date().toISOString(),
  };
};

export interface IngestTopology {
  readonly streamId: LatticeStreamId;
  readonly timestamp: BrandedTimestamp;
}
