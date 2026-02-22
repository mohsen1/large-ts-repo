import type { Brand } from '@shared/core';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryConstraintBudget, RunSession, RunPlanSnapshot, RecoverySignal } from '@domain/recovery-operations-models';
import type { IntelligenceRunId, CohortSignalAggregate, RunAssessment, BatchReadinessAssessment } from '@domain/recovery-operations-intelligence';

export type SnapshotId = Brand<string, 'OpsIntelligenceSnapshotId'>;
export type TimelinePoint = Brand<string, 'TimelinePoint'>;

export interface IntelligenceSnapshotKey {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: RecoveryRunState['runId'];
}

export interface IntelligenceSnapshot {
  readonly id: SnapshotId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: RecoveryRunState['runId'];
  readonly sourceRunId: IntelligenceRunId;
  readonly assessment: RunAssessment;
  readonly points: readonly TimelinePoint[];
  readonly recordedAt: string;
}

export interface SignalRecord {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: string;
  readonly signalId: string;
  readonly signal: RecoverySignal;
  readonly score: number;
  readonly consumedAt: string;
}

export interface RunSnapshotAggregate {
  readonly runId: string;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly sessionCount: number;
  readonly planCount: number;
  readonly snapshotCount: number;
  readonly lastSignalAt: string;
}

export interface AggregationInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: string;
  readonly windowHours: number;
  readonly minConfidence: number;
}

export interface IntelligenceArtifact {
  readonly snapshot: IntelligenceSnapshot;
  readonly plan: RunPlanSnapshot;
  readonly constraints: RecoveryConstraintBudget;
  readonly signals: readonly SignalRecord[];
  readonly cohorts: readonly CohortSignalAggregate[];
  readonly batchReadiness: BatchReadinessAssessment;
}

export interface IntelligenceRepository {
  saveSnapshot(snapshot: Omit<IntelligenceSnapshot, 'id'>): Promise<SnapshotId>;
  loadSnapshot(key: IntelligenceSnapshotKey): Promise<IntelligenceSnapshot | undefined>;
  logSignal(record: Omit<SignalRecord, 'signalId'>): Promise<string>;
  listSignalsByRun(runId: string): Promise<readonly SignalRecord[]>;
  loadAggregate(input: AggregationInput): Promise<RunSnapshotAggregate>;
  saveBatchAssessment(tenant: Brand<string, 'TenantId'>, batch: BatchReadinessAssessment): Promise<void>;
  latestBatch(tenant: Brand<string, 'TenantId'>): Promise<BatchReadinessAssessment | undefined>;
}

export interface ArtifactBundle {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runSession: RunSession;
  readonly plan: RunPlanSnapshot;
}
