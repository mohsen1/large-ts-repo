import { type FailureActionPlan, type FailureSignal, type FailureSignalId, type NewFailureSignal } from '@domain/failure-intelligence';
import { Result } from '@shared/result';

export type ErrorCode = 'schema' | 'policy' | 'store' | 'publish';

export interface OrchestrationError {
  code: ErrorCode;
  message: string;
  cause?: unknown;
}

export interface RunnerSnapshot {
  receivedSignals: number;
  plannedActions: number;
  failedRuns: number;
}

export interface IntakeResult {
  signalCount: number;
  signalIds: FailureSignalId[];
}

export interface RunResult {
  signalId: string;
  signal: FailureSignal;
  outcome: 'planned' | 'awaiting-more-signals' | 'rejected';
}

export interface RunInput {
  namespace: string;
  actor: string;
}

export type IntakeReturn = Result<IntakeResult, OrchestrationError>;
export type PlanReturn = Result<FailureActionPlan, OrchestrationError>;
export type RunReturn = Result<RunResult, OrchestrationError>;
