import { Brand, PageResult, normalizeLimit } from '@shared/core';
import { ContinuityRuntimePlan, ContinuityEventEnvelope, ContinuityRunState, ContinuityTenantId } from '@domain/continuity-orchestration';

export type ContinuityRunRecordId = Brand<string, 'ContinuityRunRecordId'>;

export interface RunRecordEnvelope {
  runId: ContinuityRuntimePlan['id'];
  tenantId: ContinuityTenantId;
  correlationId: ContinuityRuntimePlan['correlationId'];
  state: ContinuityRunState;
  createdAt: string;
  updatedAt: string;
}

export interface ContinuityRunRow {
  id: ContinuityRunRecordId;
  payload: ContinuityRuntimePlan;
  envelope: RunRecordEnvelope;
  lastEvent?: ContinuityEventEnvelope;
}

export interface JournalQuery {
  tenantId?: ContinuityTenantId;
  states?: readonly ContinuityRunState[];
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface JournalQueryResult {
  rows: ContinuityRunRow[];
  page: PageResult<ContinuityRunRow>;
}

export const normalizeJournalQuery = (query: JournalQuery): JournalQuery => ({
  ...query,
  limit: normalizeLimit(query.limit),
  cursor: query.cursor,
});
