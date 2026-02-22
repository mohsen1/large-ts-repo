import { fail, ok } from '@shared/result';

import type { Envelope } from '@shared/protocol';

import type { RecoveryArtifact } from './models';

export interface RecoveryArtifactAdapter {
  load(artifact: Envelope<unknown>): Promise<RecoveryArtifact | null>;
  emit(artifact: RecoveryArtifact): Envelope<RecoveryArtifact>;
}

export const decodeArtifact = (envelope: Envelope<unknown>): ReturnType<RecoveryArtifactAdapter['load']> => {
  if (
    typeof envelope.payload === 'object' &&
    envelope.payload !== null &&
    'runId' in envelope.payload &&
    'run' in envelope.payload &&
    'program' in envelope.payload
  ) {
    return Promise.resolve(envelope.payload as RecoveryArtifact);
  }
  return Promise.resolve(null);
};

export const encodeArtifact = (artifact: RecoveryArtifact): Envelope<RecoveryArtifact> => ({
  id: `${artifact.id}` as never,
  correlationId: `${artifact.eventId}` as never,
  timestamp: artifact.recordedAt,
  eventType: 'recovery.artifact.recorded',
  payload: artifact,
});

export const makeSafeEnvelope = (artifact: RecoveryArtifact, command: string) => {
  return {
    ok: true,
    value: {
      correlationId: artifact.eventId,
      command,
      status: artifact.run.status,
      artifactId: artifact.id,
    },
  };
};

export const artifactResult = (payload: unknown) => {
  if (payload === null || payload === undefined) return fail(new Error('payload missing'));
  return ok(payload);
};
