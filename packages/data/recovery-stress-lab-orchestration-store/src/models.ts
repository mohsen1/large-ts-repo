import {
  type OrchestrationPlan,
  type RecoverySimulationResult,
  type RecoverySignal,
  type RecoverySignalId,
  type TenantId,
  type WorkloadId,
  type WorkloadTarget,
} from '@domain/recovery-stress-lab';
import { type Result } from '@shared/result';
import type { Brand } from '@shared/type-level';

export type LatticeRunRecordId = Brand<string, 'LatticeRunRecordId'>;
export type LatticeSnapshotId = Brand<string, 'LatticeSnapshotId'>;
export type LatticeSessionId = Brand<string, 'LatticeSessionId'>;

export type LatticeMetricLabel = `${string}::${string}::${'score' | 'risk' | 'coverage' | 'latency'}`;

export interface LatticeSessionMetadata {
  readonly tenantId: TenantId;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly runName: string;
  readonly tags: readonly string[];
}

export interface LatticeSessionRecord {
  readonly recordId: LatticeRunRecordId;
  readonly sessionId: LatticeSessionId;
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan;
  readonly simulation: RecoverySimulationResult;
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly metadata: LatticeSessionMetadata;
}

export interface LatticeSnapshotPoint {
  readonly snapshotId: LatticeSnapshotId;
  readonly timestamp: string;
  readonly metric: LatticeMetricLabel;
  readonly value: number;
  readonly context: {
    readonly route: RecoverySignalId[];
    readonly workload: WorkloadId[];
    readonly activeTargets: number;
  };
}

export interface LatticeRunEnvelope {
  readonly sessionId: LatticeSessionId;
  readonly tenantId: TenantId;
  readonly planDigest: string;
  readonly simulationDigest: string;
  readonly createdAt: string;
  readonly snapshots: readonly LatticeSnapshotPoint[];
  readonly tags: readonly string[];
}

export interface LatticeStoreQuery {
  readonly tenantId?: TenantId;
  readonly from?: string;
  readonly to?: string;
  readonly runStatus?: readonly LatticeSessionRecord['status'][];
  readonly limit?: number;
}

export interface LatticeStoreAggregate {
  readonly tenantCount: number;
  readonly runCount: number;
  readonly completedCount: number;
  readonly activeSignalCount: number;
  readonly avgScore: number;
  readonly avgLatencyMs: number;
}

export type LatticeTagMap = Readonly<Record<`tenant:${string}`, readonly string[]>>;

export interface LatticeRecordStore {
  upsertSession(session: LatticeSessionRecord): Promise<Result<LatticeSessionRecord, Error>>;
  appendSnapshots(sessionId: LatticeSessionId, snapshots: readonly LatticeSnapshotPoint[]): Promise<Result<number, Error>>;
  listSessions(query: LatticeStoreQuery): Promise<readonly LatticeSessionRecord[]>;
  findSession(sessionId: LatticeSessionId): Promise<LatticeSessionRecord | undefined>;
  hydrateEnvelope(sessionId: LatticeSessionId): Promise<Result<LatticeRunEnvelope, Error>>;
}

export interface LatticeStoreFactory {
  readonly name: string;
  readonly build: () => LatticeRecordStore;
}

export const isFailureSession = (session: LatticeSessionRecord): boolean => session.status === 'failed';

export const formatSessionDigest = (session: LatticeSessionRecord): string =>
  `${session.sessionId}:${session.tenantId}:${session.status}:${session.plan.estimatedCompletionMinutes}`;

export const buildRunEnvelope = (session: LatticeSessionRecord, snapshots: readonly LatticeSnapshotPoint[]): LatticeRunEnvelope => ({
  sessionId: session.sessionId,
  tenantId: session.tenantId,
  planDigest: session.plan.scenarioName,
  simulationDigest: session.simulation.selectedRunbooks.join(','),
  createdAt: session.metadata.startedAt,
  snapshots,
  tags: session.metadata.tags,
});
