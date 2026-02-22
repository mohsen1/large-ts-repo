import type { ControlPlaneManifest } from '@domain/recovery-operations-control-plane';
import type { ControlPlaneStoreRecord, ControlPlaneStoreResult } from './models';
import { ok, fail } from '@shared/result';
import { parseRecord } from './schema';

export interface ExternalControlPlanePayload {
  readonly recordId: string;
  readonly tenant: string;
  readonly envelope: string;
  readonly payload: unknown;
}

export interface ControlPlaneEnvelopeEnvelope {
  readonly id: string;
  readonly payload: string;
  readonly metadata: {
    readonly tenant: string;
    readonly createdAt: string;
    readonly schemaVersion: string;
  };
}

export const serializeManifest = (manifest: ControlPlaneManifest): ControlPlaneEnvelopeEnvelope => ({
  id: manifest.envelopeId,
  payload: JSON.stringify(manifest),
  metadata: {
    tenant: manifest.tenant,
    createdAt: manifest.createdAt,
    schemaVersion: '1.0',
  },
});

export const parseManifestEnvelope = (input: ControlPlaneEnvelopeEnvelope): ControlPlaneManifest => {
  return JSON.parse(input.payload) as ControlPlaneManifest;
};

export const mapExternalPayload = (input: ExternalControlPlanePayload): ControlPlaneEnvelopeEnvelope => ({
  id: input.recordId,
  payload: String(input.payload),
  metadata: {
    tenant: input.tenant,
    createdAt: new Date().toISOString(),
    schemaVersion: '1.0',
  },
});

export const normalizeRecord = (raw: unknown): ControlPlaneStoreResult<ControlPlaneStoreRecord> => {
  try {
    return ok(parseRecord(raw));
  } catch (error) {
    return fail((error as Error).message);
  }
};
