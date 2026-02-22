import type {
  SituationalAssessment,
  SituationalSnapshot,
  RecoveryWorkloadNode,
  SituationalSignal,
  RecoveryPlanCandidate,
} from '@domain/recovery-situational-intelligence';

export interface SituationalStoreQuery {
  readonly workloadNodeIds: readonly string[];
  readonly onlyActive: boolean;
}

export interface PersistedAssessment {
  readonly id: string;
  readonly assessment: SituationalAssessment;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SituationalRepository {
  readonly saveAssessment: (assessment: SituationalAssessment) => Promise<PersistedAssessment>;
  readonly listAssessments: (query?: SituationalStoreQuery) => Promise<readonly PersistedAssessment[]>;
  readonly getAssessment: (assessmentId: string) => Promise<PersistedAssessment | undefined>;
  readonly appendSnapshots: (inputs: readonly SituationalSnapshot[]) => Promise<void>;
  readonly getSnapshots: (workloadNodeId: string) => Promise<readonly SituationalSnapshot[]>;
  readonly writePlan: (plan: RecoveryPlanCandidate) => Promise<void>;
  readonly listPlans: (workloadNodeId: string) => Promise<readonly RecoveryPlanCandidate[]>;
  readonly upsertSignals: (signals: readonly SituationalSignal[]) => Promise<void>;
  readonly readSignals: (workloadNodeId: string) => Promise<readonly SituationalSignal[]>;
}

export interface InMemorySituationState {
  readonly workloadNodes: readonly RecoveryWorkloadNode[];
  readonly latestAssessments: readonly PersistedAssessment[];
  readonly snapshots: ReadonlyMap<string, readonly SituationalSnapshot[]>;
}

export interface AuditEvent {
  readonly at: string;
  readonly type: 'assessment.saved' | 'plan.saved' | 'signal.ingested' | 'snapshot.ingested';
  readonly assessmentId?: string;
  readonly snapshotCount?: number;
  readonly metadata: Record<string, unknown>;
}

export type { SituationalAssessment };
