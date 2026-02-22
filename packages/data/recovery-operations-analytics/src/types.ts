import type { Brand } from '@shared/core';
import type { SessionDecision, RecoverySignal, RunSession } from '@domain/recovery-operations-models';
import type { RunAssessment } from '@domain/recovery-operations-intelligence';
import type { DeepMerge } from '@shared/type-level';

export type MetricWindowKind = 'minute' | 'hour' | 'day';

export interface MetricWindowContext {
  readonly from: string;
  readonly to: string;
  readonly zone: string;
  readonly kind: MetricWindowKind;
}

export type MetricName = Brand<string, 'MetricName'>;

export interface MetricEnvelope<TPayload> {
  readonly key: Brand<string, 'MetricEnvelopeKey'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly metric: MetricName;
  readonly context: MetricWindowContext;
  readonly payload: TPayload;
  readonly generatedAt: string;
}

export interface SessionSignalDensity {
  readonly runId: RunSession['runId'];
  readonly tenant: string;
  readonly signalCount: number;
  readonly averageSeverity: number;
  readonly confidence: number;
}

export interface AssessmentDensity {
  readonly runId: string;
  readonly riskScore: number;
  readonly decisionOutcome: 'approved' | 'blocked';
  readonly reasons: readonly string[];
}

export interface RecoveryScoreTrend {
  readonly points: readonly { timestamp: string; value: number }[];
  readonly direction: 'rising' | 'falling' | 'flat';
}

export type ScoredSession = DeepMerge<
  RunSession,
  {
    readonly riskDensity: number;
    readonly acceptanceRate: number;
    readonly signalDensity: SessionSignalDensity;
  }
>;

export interface OperationsAnalyticsWindow {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly window: MetricWindowContext;
  readonly sessions: readonly RunSession[];
  readonly sessionsByStatus: Readonly<Record<RunSession['status'], number>>;
  readonly sessionScoreTrend: RecoveryScoreTrend;
}

export interface BatchAnalyticsInput {
  readonly tenant: string;
  readonly signals: readonly RecoverySignal[];
  readonly sessions: readonly RunSession[];
  readonly decisions: readonly SessionDecision[];
  readonly assessments: readonly RunAssessment[];
}

export interface OperationsAnalyticsReport {
  readonly tenant: string;
  readonly window: MetricWindowContext;
  readonly signalDensity: SessionSignalDensity[];
  readonly scoreTrend: RecoveryScoreTrend;
  readonly runCoverage: number;
  readonly approvals: {
    readonly total: number;
    readonly accepted: number;
    readonly rejectionRate: number;
  };
  readonly riskBands: Readonly<Record<'green' | 'amber' | 'red', number>>;
  readonly createdAt: string;
}

export interface AnalyticsAdapter {
  publishReport(report: OperationsAnalyticsReport): Promise<void>;
  publishSnapshot<T>(snapshot: MetricEnvelope<T>): Promise<void>;
}
