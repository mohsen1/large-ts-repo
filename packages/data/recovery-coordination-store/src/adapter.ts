import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { CoordinationPlanCandidate, CoordinationProgram, CoordinationSelectionResult } from '@domain/recovery-coordination';
import type { Envelope, MessageId, CorrelationId } from '@shared/protocol';
import type {
  CoordinationEnvelope,
  CandidateProjection,
  RecoveryCoordinationQuery,
  CoordinationRecord,
  CoordinationRecordEnvelope,
  CandidateProjectionEnvelope,
} from './models';

export const mapRecordToEnvelope = (record: CoordinationRecord): CoordinationRecordEnvelope => ({
  id: record.recordId as MessageId,
  correlationId: `${record.runId}:${record.createdAt}` as CorrelationId,
  timestamp: new Date().toISOString(),
  eventType: 'recovery.coordination.record',
  payload: record,
});

export const mapCandidateProjection = (
  runId: CoordinationRecord['runId'],
  candidate: CoordinationPlanCandidate,
  tenant: CoordinationRecord['tenant'],
): CandidateProjection => ({
  candidateId: candidate.id,
  tenant,
  score: candidate.metadata.expectedCompletionMinutes > 0
    ? candidate.metadata.riskIndex / candidate.metadata.expectedCompletionMinutes
    : 0,
  phaseReadiness: candidate.metadata.resilienceScore,
  riskAdjusted: 1 - candidate.metadata.riskIndex,
});

export const mapCandidateEnvelope = (
  runId: CoordinationRecord['runId'],
  tenant: CoordinationRecord['tenant'],
  projection: CandidateProjection,
): CandidateProjectionEnvelope => ({
  tenant,
  runId,
  payload: projection,
  observedAt: new Date().toISOString(),
});

export const fromSelectionResult = (selection: CoordinationSelectionResult): Envelope<CoordinationSelectionResult> => ({
  id: `${selection.runId}:selection:${selection.selectedAt}` as MessageId,
  correlationId: `${selection.runId}:selection` as CorrelationId,
  timestamp: new Date().toISOString(),
  eventType: 'recovery.coordination.selection',
  payload: selection,
});

export const validateQuery = (query: RecoveryCoordinationQuery): Result<RecoveryCoordinationQuery, Error> => {
  if (query.take !== undefined && (query.take <= 0 || query.take > 10000)) {
    return fail(new Error('invalid-recovery-coordination-query-take'));
  }
  if (query.from && Number.isNaN(Date.parse(query.from))) {
    return fail(new Error('invalid-recovery-coordination-query-from'));
  }
  if (query.to && Number.isNaN(Date.parse(query.to))) {
    return fail(new Error('invalid-recovery-coordination-query-to'));
  }
  return ok(query);
};

export const asCoordinationRecord = (envelope: CoordinationEnvelope<CoordinationRecord>): CoordinationRecord | null => {
  const payload = envelope.payload;
  if (!payload || typeof payload !== 'object') return null;
  return payload as CoordinationRecord;
};

export const encodeProgram = (program: CoordinationProgram): Envelope<CoordinationProgram> => ({
  id: `${program.id}:${program.incidentId}` as MessageId,
  correlationId: `${program.correlationId}` as CorrelationId,
  timestamp: new Date().toISOString(),
  eventType: 'recovery.coordination.program',
  payload: program,
});

export const safeId = (): string =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.floor(Math.random() * 1e6).toString(16)}`;

export const makeRecordEnvelope = (
  tenant: CoordinationRecord['tenant'],
  runId: CoordinationRecord['runId'],
  payload: CoordinationRecord['program'],
): CoordinationEnvelope<CoordinationProgram> => ({
  id: `${runId}:program` as MessageId,
  correlationId: `${tenant}:run` as CorrelationId,
  timestamp: new Date().toISOString(),
  eventType: 'recovery.coordination.program',
  payload,
});

export type CoordinationRecordCodec = {
  encodeRecord: (record: CoordinationRecord) => CoordinationRecordEnvelope;
  decodeRecord: (envelope: unknown) => Result<CoordinationRecord, Error>;
};

export const defaultRecordCodec: CoordinationRecordCodec = {
  encodeRecord: mapRecordToEnvelope,
  decodeRecord: (envelope: unknown) => {
    if (!envelope || typeof envelope !== 'object') {
      return fail(new Error('coordination-envelope-missing'));
    }
    const typed = envelope as CoordinationEnvelope<unknown>;
    const payload = typed.payload;
    if (!payload || typeof payload !== 'object') return fail(new Error('coordination-envelope-invalid-payload'));
    return ok(payload as CoordinationRecord);
  },
};
