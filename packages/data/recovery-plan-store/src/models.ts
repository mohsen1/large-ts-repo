import type { Envelope } from '@shared/protocol';
import type { RecoveryCheckpoint, RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryPlanCandidate, RecoveryExecutionContext, RecoveryExecutionPlan } from '@domain/recovery-plan';

export interface RecoveryPlanArtifact {
  readonly plan: RecoveryExecutionPlan;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly checkpoint?: RecoveryCheckpoint;
}

export interface RecoveryPlanRecord {
  readonly id: string;
  readonly tenant: string;
  readonly runId: RecoveryRunState['runId'];
  readonly context: RecoveryExecutionContext;
  readonly plan: RecoveryExecutionPlan;
  readonly candidate: RecoveryPlanCandidate['id'];
  readonly createdAt: string;
}

export interface RecoveryPlanEnvelope extends Envelope<RecoveryPlanRecord> {}

export interface RecoveryPlanStoreQuery {
  readonly tenant?: string;
  readonly runId?: RecoveryRunState['runId'];
  readonly take?: number;
  readonly from?: string;
}
