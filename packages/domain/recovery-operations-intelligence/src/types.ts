import type { Brand } from '@shared/core';
import type { RecoverySignal, RunPlanSnapshot, RecoveryConstraintBudget } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { KeyPaths, PathTuple, Merge } from '@shared/type-level';

export type IntelligenceRunId = Brand<string, 'IntelligenceRunId'>;
export type DecisionSetId = Brand<string, 'DecisionSetId'>;

export type SignalDensityBucket = 'low' | 'medium' | 'high' | 'critical';
export type IntelligenceSignalSource = 'telemetry' | 'queue' | 'manual' | 'policy';

export interface SignalWindow {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly from: string;
  readonly to: string;
  readonly zone: string;
}

export interface RecoveryRiskSignal {
  readonly runId: IntelligenceRunId;
  readonly envelopeId: string;
  readonly source: IntelligenceSignalSource;
  readonly signal: RecoverySignal;
  readonly window: SignalWindow;
  readonly tags: readonly string[];
}

export interface PreparedPlanBaseline {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly snapshot: RunPlanSnapshot;
  readonly plan: RecoveryProgram;
  readonly readinessPlan: RecoveryReadinessPlan;
}

export interface IntelligenceEnvelope<TPayload> {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: IntelligenceRunId;
  readonly source: string;
  readonly emittedAt: string;
  readonly payload: TPayload;
}

export interface SignalIntensity {
  readonly bucket: SignalDensityBucket;
  readonly averageSeverity: number;
  readonly signalCount: number;
}

export interface RunAssessment {
  readonly runId: IntelligenceRunId;
  readonly tenant: string;
  readonly riskScore: number;
  readonly confidence: number;
  readonly bucket: SignalDensityBucket;
  readonly intensity: SignalIntensity;
  readonly constraints: RecoveryConstraintBudget;
  readonly recommendedActions: readonly string[];
  readonly plan: RunPlanSnapshot;
}

export type AssessmentPath<T extends RunAssessment> = KeyPaths<T>;

export type RunAssessmentSummary<TPlan = RunAssessment['plan']> = Merge<
  Omit<RunAssessment, 'plan'>,
  {
    readonly planSummary: {
      readonly planId: TPlan extends { id: infer P } ? P : string;
      readonly signalBudget: {
        readonly maxRetries: number;
        readonly timeoutMinutes: number;
      };
    };
  }
>;

export interface PolicyDecisionHint {
  readonly rule: string;
  readonly confidence: number;
  readonly reason: string;
}

export type ReadinessFieldPath = PathTuple<RecoveryReadinessPlan>;

export interface CohortSignalAggregate {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: IntelligenceRunId;
  readonly count: number;
  readonly maxConfidence: number;
  readonly distinctSources: readonly IntelligenceSignalSource[];
}

export interface BatchReadinessAssessment {
  readonly cohort: readonly CohortSignalAggregate[];
  readonly generatedAt: string;
  readonly overallRisk: 'green' | 'amber' | 'red';
}
