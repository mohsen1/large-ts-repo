import type { Brand } from '@shared/core';
import type {
  RunPlanSnapshot,
  RecoverySignal,
  RunSession,
  SessionDecision,
  SessionStatus,
} from '@domain/recovery-operations-models';

export interface RunSessionRecord extends RunSession {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly updatedAt: string;
}

export interface SignalEnvelope {
  readonly key: string;
  readonly signal: RecoverySignal;
}

export interface DecisionEnvelope {
  readonly key: string;
  readonly decision: SessionDecision;
}

export type SessionLifecycle = Pick<RunSessionRecord, 'id' | 'runId' | 'ticketId' | 'status'>;

export interface PlanRecord extends RunPlanSnapshot {
  readonly tenant: string;
  readonly checksum: string;
}

export interface SessionQueryFilter {
  readonly tenant?: string;
  readonly runId?: string;
  readonly ticketId?: string;
  readonly status?: SessionStatus | readonly SessionStatus[];
  readonly from?: string;
  readonly to?: string;
}

export interface StoreSnapshot {
  readonly tenant: string;
  readonly planId: string;
  readonly sessions: readonly RunSessionRecord[];
  readonly latestDecision?: SessionDecision;
}
