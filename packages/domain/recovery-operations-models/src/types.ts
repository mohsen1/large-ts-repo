import type { Brand } from '@shared/core';
import type { RecoveryRunState, RecoveryProgram } from '@domain/recovery-orchestration';

export type RunSessionId = Brand<string, 'RunSessionId'>;
export type RunPlanId = Brand<string, 'RunPlanId'>;
export type RunTicketId = Brand<string, 'RunTicketId'>;

export type SessionStatus = 'queued' | 'warming' | 'running' | 'blocked' | 'completed' | 'failed' | 'aborted';
export type IncidentClass = 'infrastructure' | 'database' | 'network' | 'application' | 'third-party';

export interface IncidentFingerprint {
  tenant: Brand<string, 'TenantId'>;
  region: string;
  serviceFamily: string;
  impactClass: IncidentClass;
  estimatedRecoveryMinutes: number;
}

export interface RecoveryConstraintBudget {
  maxParallelism: number;
  maxRetries: number;
  timeoutMinutes: number;
  operatorApprovalRequired: boolean;
}

export interface RecoverySignal {
  readonly id: string;
  readonly source: string;
  readonly severity: number;
  readonly confidence: number;
  readonly detectedAt: string;
  readonly details: Record<string, unknown>;
}

export interface RunSession {
  readonly id: RunSessionId;
  readonly runId: RecoveryRunState['runId'];
  readonly ticketId: RunTicketId;
  readonly planId: RunPlanId;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly constraints: RecoveryConstraintBudget;
  readonly signals: readonly RecoverySignal[];
}

export interface SessionDecision {
  readonly runId: RecoveryRunState['runId'];
  readonly ticketId: string;
  readonly accepted: boolean;
  readonly reasonCodes: readonly string[];
  readonly score: number;
  readonly createdAt: string;
}

export interface RunPlanSnapshot {
  readonly id: RunPlanId;
  readonly name: string;
  readonly program: RecoveryProgram;
  readonly constraints: RecoveryConstraintBudget;
  readonly fingerprint: IncidentFingerprint;
  readonly sourceSessionId?: RunSessionId;
  readonly effectiveAt: string;
}

export interface RecoveryOperationsEnvelope<TPayload> {
  readonly eventId: string;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export interface OperationsPolicyHook<TContext> {
  readonly hookName: string;
  readonly invoke: (context: TContext) => Promise<boolean>;
}
