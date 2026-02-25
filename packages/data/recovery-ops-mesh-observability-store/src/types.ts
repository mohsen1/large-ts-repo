import { z } from 'zod';
import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import { parseMeshSignal, parsePlanId, parseRunId, parseTopology } from '@domain/recovery-ops-mesh';
import type {
  MeshPayloadFor,
  MeshRunId,
  MeshSignalKind,
  MeshPlanId,
  MeshTopology,
} from '@domain/recovery-ops-mesh';

export type ObservabilityStoreId<T extends string> = Brand<string, `obs-store-${T}`>;

export type ObservabilityEventKind = 'record' | 'alert';

export interface ObservabilityRecordBase {
  readonly id: ObservabilityStoreId<'record'>;
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly topology: MeshTopology;
  readonly signalIndex: number;
  readonly at: number;
  readonly sampleRate: number;
  readonly source: string;
}

export interface ObservabilityRecordEnvelope extends ObservabilityRecordBase {
  readonly signal: MeshPayloadFor<MeshSignalKind>;
}

export interface ObservabilityProfileSnapshot {
  readonly cycleRisk: number;
  readonly staleNodeCount: number;
  readonly hotPathCount: number;
}

export interface ObservabilityAlertBase {
  readonly id: ObservabilityStoreId<'alert'>;
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly emittedAt: number;
}

export interface ObservabilityAlertEnvelope extends ObservabilityAlertBase {
  readonly profile: ObservabilityProfileSnapshot;
  readonly alert: string;
}

export type ObservabilityEventRecord = ObservabilityRecordEnvelope | ObservabilityAlertEnvelope;

export interface RecordCursor {
  readonly token: ObservabilityStoreId<'cursor'>;
  readonly records: readonly ObservabilityEventRecord[];
  readonly hasMore: boolean;
}

export const isObservationRecord = (
  record: ObservabilityEventRecord,
): record is ObservabilityRecordEnvelope => 'signal' in record;

export const isAlertRecord = (
  record: ObservabilityEventRecord,
): record is ObservabilityAlertEnvelope => 'alert' in record && 'emittedAt' in record;

export const observationRecordSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(3),
  planId: z.string().min(3),
  topology: z.unknown(),
  signal: z.record(z.string(), z.unknown()),
  signalIndex: z.number().nonnegative(),
  at: z.number().positive(),
  sampleRate: z.number().positive(),
  source: z.string(),
});

export const parseObservation = (value: unknown): ObservabilityRecordEnvelope => {
  const parsed = observationRecordSchema.parse(value);
  return {
    ...parsed,
    id: withBrand(parsed.id, 'obs-store-record'),
    runId: parseRunId(parsed.runId),
    planId: parsePlanId(parsed.planId),
    topology: parseTopology(parsed.topology),
    signal: parseMeshSignal(parsed.signal),
  };
};

export const recordTypes = {
  record: 'record',
  alert: 'alert',
} as const;
