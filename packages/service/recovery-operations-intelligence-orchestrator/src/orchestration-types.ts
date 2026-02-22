import type { Brand } from '@shared/core';
import type { RecoveryRiskSignal } from '@domain/recovery-operations-intelligence';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { OperationsPolicyHook } from '@domain/recovery-operations-models';
import type { RunAssessment } from '@domain/recovery-operations-intelligence';

export type RunLifecycleState = 'queued' | 'collecting' | 'assessing' | 'synthesizing' | 'routed' | 'closed';

export type OrchestrationTag = 'risk' | 'telemetry' | 'policy' | 'safety' | 'ops';

export type ScoreScale = number & { readonly __brand: 'ScoreScale' };

export type TenantId = Brand<string, 'TenantId'>;

export interface OrchestrationEvent<T = unknown> {
  readonly eventId: string;
  readonly tenant: TenantId;
  readonly kind: 'signal' | 'assessment' | 'decision' | 'route' | 'report';
  readonly issuedAt: string;
  readonly payload: T;
}

export interface OrchestratedSignalGroup {
  readonly tenant: TenantId;
  readonly runId: string;
  readonly tag: OrchestrationTag;
  readonly signals: readonly RecoveryRiskSignal[];
}

export interface ScoreBand {
  readonly label: 'green' | 'amber' | 'red';
  readonly floor: number;
  readonly ceil: number;
}

export interface SignalStats {
  readonly tenant: TenantId;
  readonly runId: string;
  readonly total: number;
  readonly severityAverage: number;
  readonly confidenceAverage: number;
}

export interface ReadinessEnvelope {
  readonly readinessPlan: ReadinessWindow;
  readonly mode: 'normal' | 'incident' | 'rehearsal';
  readonly riskThreshold: ScoreScale;
}

export interface ReadinessWindow {
  readonly tenant: TenantId;
  readonly windows: RecoveryReadinessPlan['windows'];
  readonly targetCount: number;
}

export interface RoutePolicy {
  readonly id: string;
  readonly description: string;
  readonly requiredCoverage: number;
  readonly maxConcurrency: number;
  readonly allowAutoRoute: boolean;
}

export interface RuntimeHookContext {
  readonly tenant: TenantId;
  readonly runId: string;
  readonly state: RunLifecycleState;
  readonly score: ScoreScale;
  readonly signalCount: number;
}

export type RuntimeHook = OperationsPolicyHook<RuntimeHookContext>;

export interface OrchestrationMetrics {
  readonly sessionId: string;
  readonly runId: string;
  readonly tenant: TenantId;
  readonly startedAt: string;
  readonly routeLatencyMs: number[];
  readonly assessmentCount: number;
  readonly cohortCount: number;
  readonly riskBand: 'green' | 'amber' | 'red';
}

export type ReadinessAccessor<T> = <TValue extends keyof T>(input: readonly T[], key: TValue) => readonly T[TValue][];

export type BucketedWindow<K extends string> = {
  [key in K]: RecoveryRiskSignal[];
};

export interface CohortBucket<T extends string = OrchestrationTag> {
  readonly tag: T;
  readonly score: ScoreScale;
  readonly signals: readonly RecoveryRiskSignal[];
  readonly assessments: readonly RunAssessment[];
}
