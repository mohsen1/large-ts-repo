import { Brand } from '@shared/core';
import { Result } from '@shared/result';
import { parseCursor } from '@data/query-models';
import {
  OperationPlan,
  OperationSignal,
  OperationWindow,
  ExecutionEnvelope,
  PlanDecision,
  PlanTemplate,
  Severity,
  DeploymentTrace,
  OperationId,
} from '@domain/operations-orchestration';

export type OperationsRequestId = Brand<string, 'OperationsRequestId'>;
export type OperationCorrelationId = Brand<string, 'OperationCorrelationId'>;

export interface OperationsCommand {
  tenantId: string;
  deploymentId: string;
  runbookId: string;
  severity: Severity;
  window: OperationWindow;
  tags?: readonly string[];
  requestedBy: string;
}

export interface RuntimeContext {
  requestId: OperationsRequestId;
  correlationId: OperationCorrelationId;
  requestedAt: string;
  locale?: string;
}

export interface OperationsDecision {
  allowed: boolean;
  reasons: readonly string[];
  score: number;
}

export interface OperationsRun<T extends Record<string, unknown> = Record<string, unknown>> {
  id: OperationId;
  requestId: OperationsRequestId;
  command: OperationsCommand;
  plan?: OperationPlan<T>;
  decision: OperationsDecision;
  signals: readonly OperationSignal[];
  createdAt: string;
  window: OperationWindow;
}

export interface OperationsRepository {
  upsert(run: OperationsRun): Promise<Result<void, Error>>;
  get(requestId: string): Promise<Result<OperationsRun | undefined, Error>>;
  list(tenantId: string, cursor?: string, limit?: number): Promise<Result<{ items: OperationsRun[]; cursor?: string; hasMore: boolean }, Error>>;
  append(event: DeploymentTrace): Promise<Result<void, Error>>;
}

export interface ExecutionEnvelopeBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  toEnvelope(run: OperationsRun<T>): ExecutionEnvelope<T>;
}

export interface OperationsInputPayload extends OperationsCommand {
  context: Partial<RuntimeContext>;
  signals: readonly OperationSignal[];
  policies: readonly PlanTemplate[];
}

export const buildRequestId = (tenantId: string): OperationsRequestId => `${tenantId}:${Date.now()}` as OperationsRequestId;
export const buildCorrelationId = (tenantId: string): OperationCorrelationId => `${tenantId}-corr-${Date.now()}` as OperationCorrelationId;

export const nextCursor = (cursor?: string): number => {
  const parsed = parseCursor(cursor);
  return parsed.index * parsed.pageSize;
};
