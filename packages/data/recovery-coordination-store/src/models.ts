import type {
  CandidateProjection,
  CoordinationPlanCandidate,
  CoordinationProgram,
  CoordinationCorrelationId,
  CoordinationRunId,
  CoordinationSelectionResult,
  CoordinationWindow,
  CoordinationEnvelope,
  CoordinationTenant,
  RunSnapshot,
} from '@domain/recovery-coordination';
import type { Envelope } from '@shared/protocol';

export interface CoordinationRecord {
  readonly recordId: string;
  readonly tenant: CoordinationTenant;
  readonly runId: CoordinationRunId;
  readonly program: CoordinationProgram;
  readonly selection: CoordinationSelectionResult;
  readonly window: CoordinationWindow;
  readonly candidate: CoordinationPlanCandidate;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly archived: boolean;
  readonly tags: readonly string[];
}

export interface CoordinationRecordEnvelope extends Envelope<CoordinationRecord> {}

export interface RecoveryCoordinationQuery {
  readonly tenant?: CoordinationTenant;
  readonly runId?: CoordinationRunId;
  readonly from?: string;
  readonly to?: string;
  readonly includeArchived?: boolean;
  readonly take?: number;
}

export interface CoordinationHistoryItem {
  readonly runId: CoordinationRunId;
  readonly tenant: CoordinationTenant;
  readonly correlationId: CoordinationCorrelationId;
  readonly createdAt: string;
}

export interface CoordinationSnapshot {
  readonly runId: CoordinationRunId;
  readonly tenant: CoordinationTenant;
  readonly snapshot: RunSnapshot;
  readonly createdAt: string;
}

export interface ProgramProjection {
  readonly programId: CoordinationProgram['id'];
  readonly tenant: CoordinationTenant;
  readonly scope: CoordinationProgram['scope'];
  readonly stepCount: number;
  readonly candidateCount: number;
  readonly averageResilience: number;
}

export interface CandidateProjectionEnvelope {
  readonly tenant: CoordinationTenant;
  readonly runId: CoordinationRunId;
  readonly payload: CandidateProjection;
  readonly observedAt: string;
}

export interface CandidateState {
  readonly candidateId: CoordinationPlanCandidate['id'];
  readonly snapshot: CandidateProjection;
  readonly approved: boolean;
  readonly confidence: number;
}
