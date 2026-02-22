import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

import type { RecoveryPlanStoreQuery, RecoveryPlanRecord } from './models';
import type { RecoveryPlanEnvelope } from './models';
import { buildEnvelopeFromArtifact, decodePlanRecord, encodePlanRecord, validateQuery } from './adapter';
import type { RecoveryPlanArtifact } from './models';

export interface RecoveryPlanStoreRepository {
  save(record: RecoveryPlanRecord): Promise<Result<boolean, Error>>;
  get(runId: string): Promise<RecoveryPlanRecord | undefined>;
  query(query: RecoveryPlanStoreQuery): Promise<readonly RecoveryPlanRecord[]>;
  appendEnvelope(envelope: RecoveryPlanEnvelope): Promise<Result<void, Error>>;
  latestEnvelopes(limit?: number): Promise<readonly RecoveryPlanEnvelope[]>;
}

export class InMemoryRecoveryPlanStore implements RecoveryPlanStoreRepository {
  private readonly records = new Map<string, RecoveryPlanRecord>();
  private readonly envelopes = new Map<string, RecoveryPlanEnvelope>();
  private readonly runIndex = new Map<string, string[]>();

  async save(record: RecoveryPlanRecord): Promise<Result<boolean, Error>> {
    if (!record.id || !record.runId) return fail(new Error('invalid-plan-record'));
    this.records.set(record.id, record);
    const current = this.runIndex.get(record.runId) ?? [];
    current.push(record.id);
    this.runIndex.set(record.runId, current);
    return ok(true);
  }

  async get(runId: string): Promise<RecoveryPlanRecord | undefined> {
    const runEntries = this.runIndex.get(runId);
    if (!runEntries?.length) return undefined;
    const id = runEntries.at(-1);
    if (!id) return undefined;
    return this.records.get(id);
  }

  async query(query: RecoveryPlanStoreQuery): Promise<readonly RecoveryPlanRecord[]> {
    const normalized = validateQuery(query);
    if (!normalized.ok) return [];
    const limit = normalized.value.take ?? 200;
    const entries = Array.from(this.records.values())
      .filter((record) => (query.runId ? record.runId === query.runId : true))
      .filter((record) => (query.tenant ? record.tenant === query.tenant : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
    return entries;
  }

  async appendEnvelope(envelope: RecoveryPlanEnvelope): Promise<Result<void, Error>> {
    const decoded = decodePlanRecord(envelope);
    if (!decoded.ok) return fail(decoded.error);
    this.envelopes.set(envelope.id, envelope);
    return ok(undefined);
  }

  async latestEnvelopes(limit = 10): Promise<readonly RecoveryPlanEnvelope[]> {
    const safeLimit = Math.max(1, Math.min(limit, 5000));
    const envelopes = Array.from(this.envelopes.values())
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, safeLimit);
    return envelopes;
  }

  async archive(runId: string): Promise<Result<boolean, Error>> {
    const record = await this.get(runId);
    if (!record) return fail(new Error('plan-run-missing'));
    this.records.delete(record.id);
    const runEntries = this.runIndex.get(runId) ?? [];
    const remaining = runEntries.filter((entry) => entry !== record.id);
    if (remaining.length > 0) {
      this.runIndex.set(runId, remaining);
    } else {
      this.runIndex.delete(runId);
    }
    return ok(true);
  }

  async toArtifact(record: RecoveryPlanRecord): Promise<Result<RecoveryPlanArtifact, Error>> {
    return ok({
      plan: record.plan,
      createdAt: record.createdAt,
      createdBy: record.tenant,
      checkpoint: undefined,
    });
  }
}

export const createPlanArtifact = (record: RecoveryPlanRecord): RecoveryPlanArtifact => ({
  plan: record.plan,
  createdAt: record.createdAt,
  createdBy: record.tenant,
  checkpoint: undefined,
});

export const hydrateArtifact = (
  artifact: RecoveryPlanArtifact,
): Result<RecoveryPlanRecord, Error> => {
  const envelope = buildEnvelopeFromArtifact(artifact);
  const decoded = decodePlanRecord(envelope);
  if (!decoded.ok) {
    return fail(decoded.error);
  }

  return ok({
    id: `${artifact.createdBy}:${artifact.createdAt}` as never,
    tenant: artifact.createdBy as never,
    runId: artifact.plan.runId,
    context: {
      program: artifact.plan.planId as never,
      runState: {
        runId: artifact.plan.runId,
        programId: 'unknown' as never,
        incidentId: `${artifact.createdBy}:manual` as never,
        status: 'draft',
        estimatedRecoveryTimeMinutes: 0,
      },
      requestedBy: artifact.createdBy,
      correlationId: `${artifact.createdAt}:correlation`,
      candidateBudget: 1,
    },
    plan: artifact.plan,
    candidate: artifact.plan.selected,
    createdAt: artifact.createdAt,
  });
};
