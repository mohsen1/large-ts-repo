import type { CorrelationId, Envelope, MessageId } from '@shared/protocol';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

import type { RecoveryPlanArtifact, RecoveryPlanEnvelope, RecoveryPlanRecord, RecoveryPlanStoreQuery } from './models';

export const encodePlanRecord = (
  record: RecoveryPlanRecord,
): RecoveryPlanEnvelope => ({
  id: record.id as MessageId,
  correlationId: `${record.runId}:${record.createdAt}` as CorrelationId,
  timestamp: new Date().toISOString(),
  eventType: 'recovery.plan.record',
  payload: record,
});

export const decodePlanRecord = (envelope: Envelope<unknown>): Result<RecoveryPlanRecord, Error> => {
  const payload = envelope.payload;
  if (typeof payload !== 'object' || payload === null) {
    return fail(new Error('malformed-plan-record-payload'));
  }
  return ok(payload as RecoveryPlanRecord);
};

export const buildEnvelopeFromArtifact = (artifact: RecoveryPlanArtifact): Envelope<RecoveryPlanArtifact> => ({
  id: `${artifact.plan.runId}:${artifact.createdAt}` as MessageId,
  correlationId: `${artifact.plan.planId}:artifact` as CorrelationId,
  timestamp: new Date().toISOString(),
  eventType: 'recovery.plan.artifact',
  payload: artifact,
});

export const validateQuery = (query: RecoveryPlanStoreQuery): Result<RecoveryPlanStoreQuery, Error> => {
  if (query.take !== undefined && (query.take < 1 || query.take > 5000)) {
    return fail(new Error('invalid-plan-store-query-take'));
  }
  return ok(query);
};
