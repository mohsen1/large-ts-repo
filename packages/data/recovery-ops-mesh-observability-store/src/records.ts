import { withBrand } from '@shared/core';
import type {
  MeshPayloadFor,
  MeshPlanId,
  MeshRunId,
  MeshSignalKind,
  MeshTopology,
} from '@domain/recovery-ops-mesh';
import type { ObservabilityStoreId } from './types';

export interface ObservationEnvelope {
  readonly id: ObservabilityStoreId<'record'>;
  readonly at: number;
  readonly sampleRate: number;
  readonly signalIndex: number;
  readonly source: string;
}

export interface AlertEnvelope {
  readonly id: ObservabilityStoreId<'alert'>;
  readonly emittedAt: number;
  readonly profile: {
    readonly cycleRisk: number;
    readonly staleNodeCount: number;
    readonly hotPathCount: number;
  };
  readonly alert: string;
}

export interface ObservationRecord extends ObservationEnvelope {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly topology: MeshTopology;
  readonly signal: MeshPayloadFor<MeshSignalKind>;
}

export interface AlertRecord extends AlertEnvelope {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
}

export interface ObservationBatch {
  readonly records: readonly ObservationRecord[];
  readonly alerts: readonly AlertRecord[];
  readonly createdAt: number;
}

export interface ProfileProfiledTopology {
  readonly planId: MeshPlanId;
  readonly cycleRisk: number;
  readonly staleNodes: number;
  readonly hotPaths: number;
}

export const buildObservationEnvelope = (
  payload: {
    readonly runId: MeshRunId;
    readonly planId: MeshPlanId;
    readonly topology: MeshTopology;
    readonly signal: MeshPayloadFor<MeshSignalKind>;
  },
  signalIndex: number,
): ObservationRecord => {
  return {
    id: withBrand(`obs-store-record-${payload.runId}-${signalIndex}-${Date.now()}`, 'obs-store-record'),
    runId: payload.runId,
    planId: payload.planId,
    topology: payload.topology,
    signal: payload.signal,
    at: Date.now(),
    sampleRate: Math.max(0.05, Math.min(1, 1 / (signalIndex + 1))),
    signalIndex,
    source: withBrand(`source:${payload.planId}`, 'MeshPlanId'),
  };
};

export const buildAlertEnvelope = (
  runId: MeshRunId,
  planId: MeshPlanId,
  profile: ProfileProfiledTopology,
): AlertRecord => ({
  id: withBrand(`obs-store-alert-${runId}-${Date.now()}`, 'obs-store-alert'),
  runId,
  planId,
  emittedAt: Date.now(),
  alert: `obs-alert-${runId}-${Date.now()}`,
  profile: {
    cycleRisk: profile.cycleRisk,
    staleNodeCount: profile.staleNodes,
    hotPathCount: profile.hotPaths,
  },
});

export const mergeRecordBatches = (
  ...batches: readonly ObservationBatch[]
): ObservationBatch => {
  const records = batches.flatMap((batch) => batch.records);
  const alerts = batches.flatMap((batch) => batch.alerts);
  const createdAt = Math.max(
    0,
    ...batches.map((batch) => batch.createdAt),
  );

  return {
    records,
    alerts,
    createdAt,
  };
};

export const emptyBatch = (seed: number): ObservationBatch => ({
  records: [],
  alerts: [],
  createdAt: seed,
});

export const isObservationRecordEnvelope = (record: ObservationRecord | AlertRecord): record is ObservationRecord =>
  'signalIndex' in record;
