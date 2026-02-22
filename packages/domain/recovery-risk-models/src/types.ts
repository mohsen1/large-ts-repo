import type { Brand } from '@shared/core';
import type { DeepMerge, DeepReadonly } from '@shared/type-level';

export type RiskSignalId = Brand<string, 'RiskSignalId'>;
export type RiskProfileId = Brand<string, 'RiskProfileId'>;
export type RiskRunId = Brand<string, 'RiskRunId'>;

export type RiskDimension = 'blastRadius' | 'recoveryLatency' | 'dataLoss' | 'dependencyCoupling' | 'compliance';
export type SignalSource = 'sre' | 'telemetry' | 'policy' | 'incidentFeed' | 'manual';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskSignal {
  readonly id: RiskSignalId;
  readonly runId: RiskRunId;
  readonly source: SignalSource;
  readonly observedAt: string;
  readonly metricName: string;
  readonly dimension: RiskDimension;
  readonly value: number;
  readonly weight: number;
  readonly tags: readonly string[];
  readonly context: Record<string, string>;
}

export interface RiskFactor {
  readonly name: string;
  readonly dimension: RiskDimension;
  readonly impact: number;
  readonly confidence: number;
  readonly evidence: string;
}

export interface RecoveryRiskProfile {
  readonly id: RiskProfileId;
  readonly programId: Brand<string, 'RecoveryProgramId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId?: RiskRunId;
  readonly factors: readonly RiskFactor[];
  readonly window: RiskWindow;
  readonly aggregateScore: number;
  readonly severity: RiskSeverity;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RiskWindow {
  readonly validFrom: string;
  readonly validTo: string;
  readonly timezone: string;
  readonly horizonMinutes: number;
}

export type DimensionScores = DeepReadonly<Record<RiskDimension, number>>;

export interface RiskContext {
  readonly programId: Brand<string, 'RecoveryProgramId'>;
  readonly runId: RiskRunId;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly currentStatus: 'draft' | 'staging' | 'running' | 'completed' | 'aborted' | 'failed';
  readonly allowedWindow: RiskWindow;
}

export interface RiskFinding {
  readonly factorName: string;
  readonly dimension: RiskDimension;
  readonly severity: RiskSeverity;
  readonly score: number;
  readonly recommendation: string;
}

export interface RiskAssessment {
  readonly assessmentId: Brand<string, 'RiskAssessmentId'>;
  readonly profileId: RiskProfileId;
  readonly score: number;
  readonly dimensionScores: DimensionScores;
  readonly severity: RiskSeverity;
  readonly findings: readonly RiskFinding[];
  readonly normalizedAt: string;
}

export type RiskVector = ReadonlyArray<RiskSignal>;

export interface RiskEnvelope {
  readonly assessment: RiskAssessment;
  readonly context: RiskContext;
  readonly signals: DeepMerge<RiskContext, { readonly reviewedBy?: string }>;
}
