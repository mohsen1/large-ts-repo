import type { DrillRunEnvelope, DrillHealthFrame } from '@domain/recovery-drill-lab';
import { computeSnapshotAnalysis } from '@domain/recovery-drill-lab';

export interface TelemetryRecord {
  readonly runId: string;
  readonly frames: readonly DrillHealthFrame[];
  readonly createdAt: string;
  readonly checksum: string;
}

const store = new Map<string, TelemetryRecord[]>();

export const recordTelemetry = (envelope: DrillRunEnvelope): void => {
  const analysis = computeSnapshotAnalysis(envelope.payload);
  const records = store.get(envelope.payload.id) ?? [];
  records.push({
    runId: envelope.payload.id,
    frames: analysis.topRiskFrames,
    createdAt: envelope.indexedAt,
    checksum: envelope.checksum,
  });
  store.set(envelope.payload.id, records);
};

export const listTelemetry = (runId: string): readonly TelemetryRecord[] => {
  return store.get(runId) ?? [];
};

export const flattenEnvelopes = (envelopes: readonly DrillRunEnvelope[]): never[] => {
  return envelopes.map((entry) => entry.payload as never);
};
