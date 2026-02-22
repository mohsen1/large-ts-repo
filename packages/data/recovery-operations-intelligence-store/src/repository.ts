import type {
  IntelligenceSnapshot,
  IntelligenceRepository,
  IntelligenceSnapshotKey,
  SignalRecord,
  SnapshotId,
  AggregationInput,
  RunSnapshotAggregate,
} from './models';
import type { Brand } from '@shared/core';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import { withBrand } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';
import { parseSignalRecord, snapshotIdSchema } from './schema';
import type { BatchReadinessAssessment } from '@domain/recovery-operations-intelligence';

export class MemoryIntelligenceStore implements IntelligenceRepository {
  private readonly snapshots = new Map<string, IntelligenceSnapshot>();
  private readonly signals = new Map<string, SignalRecord[]>();
  private readonly batches = new Map<string, BatchReadinessAssessment>();

  async saveSnapshot(snapshot: Omit<IntelligenceSnapshot, 'id'>): Promise<SnapshotId> {
    const id = withBrand(`${snapshot.tenant}-${snapshot.runId}-${Date.now()}`, 'OpsIntelligenceSnapshotId');
    const record: IntelligenceSnapshot = { ...snapshot, id };
    const key = this.keyFrom(snapshot.tenant, snapshot.runId);
    this.snapshots.set(key, record);
    return id;
  }

  async loadSnapshot(key: IntelligenceSnapshotKey): Promise<IntelligenceSnapshot | undefined> {
    return this.snapshots.get(this.keyFrom(key.tenant, key.runId));
  }

  async logSignal(record: Omit<SignalRecord, 'signalId'>): Promise<string> {
    const signalId = `${record.runId}::${record.consumedAt}::${Date.now()}`;
    const signalRecord: SignalRecord = { ...record, signalId };
    const runSignals = this.signals.get(record.runId) ?? [];
    this.signals.set(record.runId, [...runSignals, signalRecord]);
    return signalId;
  }

  async listSignalsByRun(runId: string): Promise<readonly SignalRecord[]> {
    return this.signals.get(runId) ?? [];
  }

  async loadAggregate(input: AggregationInput): Promise<RunSnapshotAggregate> {
    const now = Date.now();
    const window = input.windowHours * 60 * 60 * 1000;
    const tenantSignals = Array.from(this.signals.values()).flat().filter((record) => record.tenant === input.tenant);

    const recent = tenantSignals.filter((record) => {
      const consumedAt = Date.parse(record.consumedAt);
      return Number.isFinite(consumedAt) && consumedAt >= now - window && record.score >= input.minConfidence;
    });

    return {
      runId: input.runId,
      tenant: input.tenant,
      sessionCount: recent.length,
      planCount: recent.reduce((total, record) => total + record.signalId.length, 0) % 10,
      snapshotCount: this.snapshots.size,
      lastSignalAt: recent.sort((a, b) => (a.consumedAt < b.consumedAt ? 1 : -1))[0]?.consumedAt ?? new Date(0).toISOString(),
    };
  }

  async saveBatchAssessment(tenant: Brand<string, 'TenantId'>, batch: BatchReadinessAssessment): Promise<void> {
    this.batches.set(tenant, batch);
  }

  async latestBatch(tenant: Brand<string, 'TenantId'>): Promise<BatchReadinessAssessment | undefined> {
    return this.batches.get(tenant);
  }

  private keyFrom(tenant: Brand<string, 'TenantId'>, runId: RecoveryRunState['runId']): string {
    return `${tenant}::${runId}`;
  }
}

export class ValidatingIntelligenceStore implements IntelligenceRepository {
  constructor(private readonly delegate: IntelligenceRepository) {}

  private validateKey = (key: IntelligenceSnapshotKey): Result<IntelligenceSnapshotKey, string> => {
    if (!key.runId) {
      return fail('INVALID_KEY');
    }
    return ok(key);
  };

  async saveSnapshot(snapshot: Omit<IntelligenceSnapshot, 'id'>): Promise<SnapshotId> {
    return this.delegate.saveSnapshot(snapshot);
  }

  async loadSnapshot(key: IntelligenceSnapshotKey): Promise<IntelligenceSnapshot | undefined> {
    const parsed = this.validateKey(key);
    if (!parsed.ok) {
      return undefined;
    }
    return this.delegate.loadSnapshot(parsed.value);
  }

  async logSignal(record: Omit<SignalRecord, 'signalId'>): Promise<string> {
    parseSignalRecord(record);
    return this.delegate.logSignal(record);
  }

  async listSignalsByRun(runId: string): Promise<readonly SignalRecord[]> {
    return this.delegate.listSignalsByRun(runId);
  }

  async loadAggregate(input: AggregationInput): Promise<RunSnapshotAggregate> {
    return this.delegate.loadAggregate(input);
  }

  async saveBatchAssessment(tenant: Brand<string, 'TenantId'>, batch: BatchReadinessAssessment): Promise<void> {
    return this.delegate.saveBatchAssessment(tenant, batch);
  }

  async latestBatch(tenant: Brand<string, 'TenantId'>): Promise<BatchReadinessAssessment | undefined> {
    return this.delegate.latestBatch(tenant);
  }
}

export const resolveSnapshotId = (input: unknown): SnapshotId => snapshotIdSchema.parse(input);
