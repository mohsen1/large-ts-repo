import type { RecoveryProgram, RecoveryRunId, RecoveryRunState, RecoveryStep } from '@domain/recovery-orchestration';
import type { RecoveryPolicy } from '@domain/recovery-policy';

export type Brand<T, BrandName extends string> = T & {
  readonly __brand: BrandName;
};

export type CoordinationId = RecoveryProgram['id'];
export type CoordinationRunId = RecoveryRunId;
export type CoordinationTenant = RecoveryProgram['tenant'];
export type CoordinationCorrelationId = Brand<string, 'CoordinationCorrelationId'>;

export type CoordinationScope = 'incident' | 'maintenance' | 'security' | 'capacity';
export type CoordinationPhase = 'discover' | 'plan' | 'execute' | 'observe' | 'close';
export type CoordinationPriority = 'bronze' | 'silver' | 'gold' | 'platinum';
export type CoordinationPolicyResult = 'approved' | 'deferred' | 'blocked';
export type ConstraintKind =
  | 'dependency'
  | 'parallelism'
  | 'region'
  | 'tenant'
  | 'change-freeze';

export interface CoordinationWindow {
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
}

export interface CoordinationPolicyDecision {
  readonly policyId: RecoveryPolicy['id'];
  readonly result: CoordinationPolicyResult;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly evaluatedAt: string;
}

export interface ConstraintBoundary {
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly softLimit: number;
  readonly hardLimit: number;
}

export interface CoordinationConstraint {
  readonly id: string;
  readonly kind: ConstraintKind;
  readonly weight: number;
  readonly scope: CoordinationScope;
  readonly affectedStepIds: readonly RecoveryStep['id'][];
  readonly details: string;
  readonly tags: readonly string[];
  readonly boundary?: ConstraintBoundary;
}

export interface CoordinationStep {
  readonly id: string;
  readonly command: RecoveryStep['command'];
  readonly title: string;
  readonly priority: CoordinationPriority;
  readonly durationSeconds: number;
  readonly requires: readonly string[];
  readonly optionalFallbackIds: readonly string[];
  readonly criticality: number;
  readonly tags: readonly string[];
}

export interface CoordinationProgram {
  readonly id: CoordinationId;
  readonly tenant: CoordinationTenant;
  readonly incidentId: string;
  readonly scope: CoordinationScope;
  readonly runWindow: CoordinationWindow;
  readonly phase: CoordinationPhase;
  readonly requestedBy: string;
  readonly correlationId: CoordinationCorrelationId;
  readonly rawProgram: RecoveryProgram;
  readonly steps: readonly CoordinationStep[];
  readonly constraints: readonly CoordinationConstraint[];
  readonly createdAt: string;
}

export interface RunSequenceMetadata {
  readonly parallelism: number;
  readonly expectedCompletionMinutes: number;
  readonly riskIndex: number;
  readonly resilienceScore: number;
}

export interface CoordinationPlanCandidate {
  readonly id: string;
  readonly correlationId: CoordinationCorrelationId;
  readonly programId: CoordinationId;
  readonly runId: CoordinationRunId;
  readonly tenant: CoordinationTenant;
  readonly steps: readonly CoordinationStep[];
  readonly sequence: readonly string[];
  readonly metadata: RunSequenceMetadata;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface RunSnapshot {
  readonly runId: CoordinationRunId;
  readonly tenant: CoordinationTenant;
  readonly state: RecoveryRunState;
  readonly coordinationPolicyResult: CoordinationPolicyDecision['result'];
  readonly latestPlan?: CoordinationPlanCandidate;
  readonly signalCount: number;
  readonly updatedAt: string;
}

export interface CoordinationEnvelope<TPayload extends object> {
  readonly id: string;
  readonly correlationId: CoordinationCorrelationId;
  readonly timestamp: string;
  readonly eventType: string;
  readonly payload: TPayload;
}

export interface CoordinationTelemetryEvent {
  readonly runId: CoordinationRunId;
  readonly tenant: CoordinationTenant;
  readonly phase: CoordinationPhase;
  readonly message: string;
  readonly tags: readonly string[];
  readonly emittedAt: string;
}

export interface CoordinationRiskSignal {
  readonly id: string;
  readonly runId: CoordinationRunId;
  readonly score: number;
  readonly source: string;
  readonly observedAt: string;
  readonly message: string;
  readonly dimension: 'latency' | 'blastRadius' | 'dataLoss' | 'compliance' | 'dependency';
}

export interface CoordinationBudget {
  readonly maxStepCount: number;
  readonly maxParallelism: number;
  readonly maxRuntimeMinutes: number;
  readonly maxCriticality: number;
}

export interface CoordinationSelectionResult {
  readonly runId: CoordinationRunId;
  readonly selectedCandidate: CoordinationPlanCandidate;
  readonly alternatives: readonly CoordinationPlanCandidate[];
  readonly decision: CoordinationPolicyDecision['result'];
  readonly blockedConstraints: readonly CoordinationConstraint['id'][];
  readonly reasons: readonly string[];
  readonly selectedAt: string;
}

export interface CoordinationServiceError {
  readonly code:
  | 'program-missing'
  | 'step-graph-cycle'
  | 'policy-block'
  | 'runtime-budget-exceeded'
  | 'delivery-failed'
  | 'repository-error'
  | 'invalid-input';
  readonly message: string;
  readonly correlationId: CoordinationCorrelationId;
}

export interface CandidateProjection {
  readonly candidateId: CoordinationPlanCandidate['id'];
  readonly tenant: CoordinationTenant;
  readonly score: number;
  readonly phaseReadiness: number;
  readonly riskAdjusted: number;
}

export interface CoordinationServiceView {
  readonly tenant: CoordinationTenant;
  readonly active: readonly RunSnapshot[];
  readonly queued: number;
  readonly avgRiskIndex: number;
  readonly avgResilience: number;
}

export type CandidateScorer = (candidate: CoordinationPlanCandidate) => number;

export type PolicyEvaluator = (
  runId: CoordinationRunId,
  runState: RecoveryRunState,
) => Promise<CoordinationPolicyDecision>;
