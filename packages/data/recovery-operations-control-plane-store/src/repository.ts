import type { ControlPlaneManifest } from '@domain/recovery-operations-control-plane';
import type { ControlPlaneStoreQuery, ControlPlaneStoreRecord, ControlPlaneStoreResult } from './models';

export interface ControlPlaneStore {
  save(manifest: ControlPlaneManifest): Promise<ControlPlaneStoreResult<ControlPlaneStoreRecord>>;
  findByRun(tenant: string, runId: string): Promise<ControlPlaneStoreResult<ControlPlaneStoreRecord | undefined>>;
  query(query: ControlPlaneStoreQuery): Promise<ControlPlaneStoreResult<readonly ControlPlaneStoreRecord[]>>;
  delete(recordId: string): Promise<ControlPlaneStoreResult<boolean>>;
}

export interface ControlPlaneStoreFactory {
  createLabel(tag: string): string;
  createRecordId(tenant: string, runId: string): string;
}

export const toStoreRecord = (
  manifest: ControlPlaneManifest,
  summary: {
    tenant: string;
    planId: string;
    commandCount: number;
    hasConflicts: boolean;
    riskBand: 'low' | 'medium' | 'high';
  },
): Omit<ControlPlaneStoreRecord, 'id' | 'sequence'> => ({
  state: {
    runId: manifest.run as string,
    envelopeId: manifest.envelopeId,
    tenant: summary.tenant,
    planId: summary.planId,
    state: manifest.timeline.some((entry) => entry.tags.includes('policy-blocked')) ? 'aborted' : 'queued',
    updatedAt: manifest.updatedAt,
  },
  summary,
  diagnostics: [
    {
      key: 'commands',
      value: summary.commandCount,
      observedAt: manifest.updatedAt,
    },
    {
      key: 'checkpoints',
      value: manifest.checkpoints.length,
      observedAt: manifest.updatedAt,
    },
  ],
});
