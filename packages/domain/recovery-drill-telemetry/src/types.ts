import type { RecoveryDrillTenantId, RecoveryDrillTelemetryRunId } from './ids';
import type { Brand } from '@shared/core';
import type { RecoveryDrillRunStepTag } from './vocabulary';

export type RecoverySignalSeverity = 'info' | 'warn' | 'degrade' | 'error' | 'critical';
export type RecoveryRunStatus = 'planned' | 'running' | 'paused' | 'succeeded' | 'degraded' | 'failed' | 'cancelled';

export interface RecoveryDrillTimelinePoint {
  at: string;
  value: number;
  source: string;
}

export interface RecoveryDrillHealthMetric {
  name: string;
  unit: string;
  baseline: number;
  current: number;
  minSafe: number;
  maxSafe: number;
}

export interface RecoveryDrillEvent {
  readonly kind: RecoveryDrillEventKind;
  readonly at: string;
  readonly runId: RecoveryDrillTelemetryRunId;
  readonly tenant: RecoveryDrillTenantId;
  readonly scenarioId: Brand<string, 'RecoveryDrillScenarioId'>;
  readonly stepId?: Brand<string, 'RecoveryDrillStepId'>;
  readonly severity: RecoverySignalSeverity;
  readonly title: string;
  readonly payload: Record<string, unknown>;
}

export interface RecoveryDrillMetricSample {
  readonly metric: RecoveryDrillHealthMetric;
  readonly eventId: string;
  readonly correlationId: string;
  readonly observedAt: string;
}

export interface RecoveryDrillRunContext {
  readonly runId: RecoveryDrillTelemetryRunId;
  readonly tenant: RecoveryDrillTenantId;
  readonly scenarioId: Brand<string, 'RecoveryDrillScenarioId'>;
  readonly startedAt: string;
  readonly initiatedBy: string;
  readonly status: RecoveryRunStatus;
  readonly stepCount: number;
  readonly zone: string;
}

export interface RecoveryDrillEnvelope<T> {
  readonly id: string;
  readonly kind: RecoveryDrillEventKind;
  readonly version: string;
  readonly body: T;
  readonly receivedAt: string;
}

export type RecoveryDrillEventKind =
  | 'signal'
  | 'metric'
  | 'transition'
  | 'checkpoint'
  | 'anomaly';

export interface RecoveryDrillStepHealth {
  readonly stepId: Brand<string, 'RecoveryDrillStepId'>;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly latencyMs: number;
  readonly success: number;
  readonly retries: number;
  readonly tags: RecoveryDrillRunStepTag[];
}

export interface RecoveryDrillRunSummary {
  readonly runId: RecoveryDrillTelemetryRunId;
  readonly tenant: RecoveryDrillTenantId;
  readonly scenarioId: Brand<string, 'RecoveryDrillScenarioId'>;
  readonly status: RecoveryRunStatus;
  readonly events: number;
  readonly metrics: number;
  readonly criticalHits: number;
  readonly healthScore: number;
  readonly latencyP95Ms: number;
  readonly stepHealth: readonly RecoveryDrillStepHealth[];
}
