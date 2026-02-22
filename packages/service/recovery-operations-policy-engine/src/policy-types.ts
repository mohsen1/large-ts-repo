import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import type { RecoveryReadinessPlan, ReadinessSignal } from '@domain/recovery-readiness';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoverySignal, RunSession } from '@domain/recovery-operations-models';

export type PolicyEngineStep = 'prepare' | 'evaluate' | 'score' | 'publish';
export type PolicyRunState = 'queued' | 'running' | 'blocked' | 'allowed' | 'errored';

export interface PolicyExecutionContext {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: string;
  readonly sessionId: string;
  readonly session: RunSession;
  readonly program: RecoveryProgram;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoverySignal[];
  readonly readinessSignals: readonly ReadinessSignal[];
  readonly startedAt: string;
  readonly triggeredBy: 'ui' | 'scheduler' | 'simulation' | 'manual';
}

export interface PolicyResultEnvelope {
  readonly tenant: string;
  readonly runId: string;
  readonly state: PolicyRunState;
  readonly steps: readonly PolicyEngineStep[];
  readonly outcome?: {
    readonly decision: 'allow' | 'block';
    readonly reason: string;
    readonly confidence: number;
  };
  readonly summary: PolicyDecisionSummary;
  readonly scoreCard: PolicyScoreCard;
  readonly complianceTags: readonly string[];
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface PolicyDecisionSummary {
  readonly decision: 'allow' | 'block';
  readonly decisionReason: string;
  readonly confidence: number;
  readonly criticality: 'low' | 'medium' | 'high' | 'critical';
  readonly findings: readonly string[];
}

export interface PolicyScoreCard {
  readonly signalScore: number;
  readonly policyScore: number;
  readonly densityScore: number;
  readonly riskScore: number;
  readonly readinessScore: number;
  readonly compositeScore: number;
}

export interface PolicyExecutionMeta {
  readonly source: string;
  readonly correlationId: string;
  readonly attempts: number;
  readonly tags: readonly string[];
  readonly ownerTeam: string;
  readonly requestedBy: string;
}

export interface PolicyEnvelopeBundle {
  readonly context: PolicyExecutionContext;
  readonly outcome: PolicyResultEnvelope;
  readonly meta: PolicyExecutionMeta;
}

export type SeverityBreakdown = Readonly<Record<'low' | 'medium' | 'high' | 'critical', number>>;

export interface PolicyValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: keyof SeverityBreakdown;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PolicyValidationReport {
  readonly issues: readonly PolicyValidationIssue[];
  readonly isValid: boolean;
  readonly recommendedFixes: readonly string[];
}

export interface PolicySimulationInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: Brand<string, 'RecoveryRunId'>;
  readonly program: RecoveryProgram;
  readonly signals: readonly RecoverySignal[];
  readonly baselineDensity: number;
  readonly activeSignalsBySource: Readonly<Record<string, number>>;
  readonly nowIso: string;
}

export interface PolicySimulationResult {
  readonly score: number;
  readonly expectedOutcome: 'allow' | 'block';
  readonly riskProjection: {
    readonly immediate: number;
    readonly projected15m: number;
    readonly projected1h: number;
  };
  readonly policyDelta: {
    readonly passed: number;
    readonly blocked: number;
    readonly confidence: number;
  };
}

export interface PolicyTimelinePoint {
  readonly at: string;
  readonly phase: PolicyEngineStep;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly message: string;
}

export interface PolicyTimeline {
  readonly runId: string;
  readonly tenant: string;
  readonly points: readonly PolicyTimelinePoint[];
}

export const nowIso = (): string => new Date().toISOString();

export const identitySignalEnvelope = (runId: string, signal: RecoverySignal): Readonly<{
  readonly runId: string;
  readonly signalId: string;
  readonly confidence: number;
}> => ({
  runId: withBrand(runId, 'RecoveryRunId'),
  signalId: signal.id,
  confidence: signal.confidence,
});
