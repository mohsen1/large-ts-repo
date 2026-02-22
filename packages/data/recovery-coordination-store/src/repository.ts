import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { resolve } from 'node:path';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import { asCoordinationRecord, validateQuery, defaultRecordCodec } from './adapter';
import { applyQuery, summarizeProgramProjection } from './query';
import type {
  CoordinationRecord,
  CoordinationRecordEnvelope,
  CoordinationSnapshot,
  RecoveryCoordinationQuery,
  ProgramProjection,
  CandidateState,
  CandidateProjectionEnvelope,
} from './models';

export interface RecoveryCoordinationStore {
  save(record: CoordinationRecord): Promise<Result<boolean, Error>>;
  getByRunId(runId: CoordinationRecord['runId']): Promise<CoordinationRecord | undefined>;
  getSnapshot(runId: CoordinationRecord['runId']): Promise<CoordinationSnapshot | undefined>;
  query(query: RecoveryCoordinationQuery): Promise<readonly CoordinationRecord[]>;
  append(record: CoordinationRecordEnvelope): Promise<Result<void, Error>>;
  latest(runId: CoordinationRecord['runId'], limit?: number): Promise<readonly CoordinationRecord[]>;
  project(runId: CoordinationRecord['runId']): Promise<ProgramProjection | undefined>;
  archive(runId: CoordinationRecord['runId']): Promise<Result<boolean, Error>>;
}

export class InMemoryRecoveryCoordinationStore implements RecoveryCoordinationStore {
  private readonly records = new Map<string, CoordinationRecord>();
  private readonly envelopes = new Map<string, CoordinationRecordEnvelope>();
  private readonly runIndex = new Map<string, string[]>();
  private readonly snapshots = new Map<string, CoordinationSnapshot>();
  private readonly candidateStates = new Map<string, CandidateState>();

  async save(record: CoordinationRecord): Promise<Result<boolean, Error>> {
    if (!record.recordId || !record.runId) return fail(new Error('invalid-coordination-record'));
    this.records.set(record.recordId, record);
    const entries = this.runIndex.get(record.runId) ?? [];
    this.runIndex.set(record.runId, [...entries, record.recordId]);
    this.snapshots.set(record.runId, {
      runId: record.runId,
      tenant: record.tenant,
      snapshot: {
        runId: record.runId,
        tenant: record.tenant,
        state: this.selectionRunState(record.selection, record.createdAt),
        coordinationPolicyResult: record.selection.decision,
        signalCount: record.selection.alternatives.length,
        updatedAt: record.createdAt,
      },
      createdAt: record.createdAt,
    });
    const best = this.selectionState(record.selection);
    this.candidateStates.set(record.selection.selectedCandidate.id, best);
    return ok(true);
  }

  async getByRunId(runId: CoordinationRecord['runId']): Promise<CoordinationRecord | undefined> {
    const ids = this.runIndex.get(runId);
    const latest = ids?.at(-1);
    if (!latest) return undefined;
    return this.records.get(latest);
  }

  async getSnapshot(runId: CoordinationRecord['runId']): Promise<CoordinationSnapshot | undefined> {
    return this.snapshots.get(runId);
  }

  async query(query: RecoveryCoordinationQuery): Promise<readonly CoordinationRecord[]> {
    const normalized = applyQuery(Array.from(this.records.values()), query);
    if (!normalized.records.length) return [];
    return normalized.records;
  }

  async append(envelope: CoordinationRecordEnvelope): Promise<Result<void, Error>> {
    const decoded = asCoordinationRecord(envelope);
    if (!decoded) return fail(new Error('bad-envelope-payload'));
    this.envelopes.set(decoded.recordId, envelope);
    await this.save(decoded);
    return ok(undefined);
  }

  async latest(runId: CoordinationRecord['runId'], limit = 5): Promise<readonly CoordinationRecord[]> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const runEntries = Array.from(this.records.values())
      .filter((record) => record.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, safeLimit);
    return runEntries;
  }

  async project(runId: CoordinationRecord['runId']): Promise<ProgramProjection | undefined> {
    const snapshot = await this.getSnapshot(runId);
    if (!snapshot) return undefined;

    const latestRecord = await this.getByRunId(runId);
    if (!latestRecord) return undefined;

    return summarizeProgramProjection({
      program: latestRecord.program,
      selection: latestRecord.selection,
    });
  }

  async archive(runId: CoordinationRecord['runId']): Promise<Result<boolean, Error>> {
    const ids = this.runIndex.get(runId) ?? [];
    if (!ids.length) return fail(new Error('run-not-found'));
    for (const id of ids) {
      const record = this.records.get(id);
      if (!record) continue;
      this.records.set(id, { ...record, archived: true });
    }
    return ok(true);
  }

  async snapshot(runId: CoordinationRecord['runId']): Promise<CoordinationSnapshot | undefined> {
    return this.getSnapshot(runId);
  }

  async recover(
    path = resolve(process.cwd(), 'data', 'recovery-coordination-store'),
  ): Promise<Result<number, Error>> {
    const had = this.records.size;
    return ok(had);
  }

  async purgeExpired(before: string): Promise<number> {
    const cutoff = Date.parse(before);
    let removed = 0;
    for (const [id, record] of this.records) {
      if (!record.expiresAt) continue;
      if (Date.parse(record.expiresAt) < cutoff) {
        this.records.delete(id);
        this.envelopes.delete(id);
        const runIds = this.runIndex.get(record.runId) ?? [];
        this.runIndex.set(
          record.runId,
          runIds.filter((entry) => entry !== id),
        );
        if (this.snapshots.get(record.runId)?.runId === record.runId) {
          this.snapshots.delete(record.runId);
        }
        removed += 1;
      }
    }
    return removed;
  }

  async queryProjections(runId: CoordinationRecord['runId']): Promise<readonly CandidateProjectionEnvelope[]> {
    const records = await this.latest(runId, 10);
    return records.map((record) => {
      const candidate = record.selection.selectedCandidate;
      const projection = {
        candidateId: candidate.id,
        tenant: record.tenant,
        score: candidate.metadata.expectedCompletionMinutes > 0
          ? candidate.metadata.riskIndex / candidate.metadata.expectedCompletionMinutes
          : 0,
        phaseReadiness: candidate.metadata.resilienceScore,
        riskAdjusted: candidate.metadata.riskIndex,
      };
      return {
        tenant: record.tenant,
        runId: record.runId,
        payload: projection,
        observedAt: record.createdAt,
      };
    });
  }

  private selectionState(selection: CoordinationRecord['selection']): CandidateState {
    return {
      candidateId: selection.selectedCandidate.id,
      snapshot: {
        candidateId: selection.selectedCandidate.id,
        tenant: selection.selectedCandidate.tenant,
        score: selection.selectedCandidate.metadata.riskIndex,
        phaseReadiness: selection.selectedCandidate.metadata.resilienceScore,
        riskAdjusted: selection.selectedCandidate.metadata.riskIndex,
      },
      approved: selection.decision === 'approved',
      confidence: selection.selectedCandidate.metadata.expectedCompletionMinutes,
    };
  }

  private selectionRunState(selection: CoordinationRecord['selection'], createdAt: string): RecoveryRunState {
    return {
      runId: `${selection.selectedCandidate.runId}` as RecoveryRunState['runId'],
      programId: `${selection.selectedCandidate.programId}` as RecoveryRunState['programId'],
      incidentId: `${selection.selectedCandidate.tenant}` as RecoveryRunState['incidentId'],
      status: selection.decision === 'approved' ? 'completed' : 'staging',
      estimatedRecoveryTimeMinutes: 0,
      startedAt: createdAt,
    };
  }
}

export const createDefaultStore = () => new InMemoryRecoveryCoordinationStore();
