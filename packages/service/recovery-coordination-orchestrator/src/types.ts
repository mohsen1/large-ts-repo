import type { RecoveryProgram, RecoveryRunState, RecoveryRunId } from '@domain/recovery-orchestration';
import type { CoordinationPlanCandidate, CoordinationProgram, CoordinationSelectionResult } from '@domain/recovery-coordination';

export interface CoordinationCommandContext {
  readonly requestedBy: string;
  readonly tenant: string;
  readonly correlationId: string;
}

export interface CoordinationAttemptInput {
  readonly commandId: string;
  readonly tenant: string;
  readonly program: RecoveryProgram;
  readonly runState: RecoveryRunState;
  readonly runId: RecoveryRunId;
  readonly context: CoordinationCommandContext;
  readonly budget?: {
    maxStepCount?: number;
    maxParallelism?: number;
    maxRuntimeMinutes?: number;
  };
}

export interface CoordinationCommandState {
  readonly runId: RecoveryRunId;
  readonly state: RecoveryRunState['status'];
  readonly phase: 'discovery' | 'planning' | 'selection' | 'delivery' | 'complete' | 'abort';
  readonly startedAt: string;
  readonly lastUpdatedAt: string;
  readonly progressPercent: number;
}

export interface CoordinationAttemptReport {
  readonly runId: RecoveryRunId;
  readonly correlationId: string;
  readonly tenant: string;
  readonly accepted: boolean;
  readonly plan: CoordinationPlanCandidate;
  readonly selection: CoordinationSelectionResult;
  readonly state: CoordinationCommandState;
}
