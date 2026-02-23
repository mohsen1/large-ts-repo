import type { ForecastEnvelope, RecoveryTimeline, RecoveryTelemetrySnapshot } from '@domain/recovery-timeline';

export interface OrchestrationInput {
  timeline: RecoveryTimeline;
  dryRun?: boolean;
  actor: string;
  requestedAction: 'advance' | 'simulate' | 'reopen';
}

export interface OrchestrationResult {
  timeline: RecoveryTimeline;
  snapshot?: RecoveryTelemetrySnapshot;
  forecast?: ForecastEnvelope;
  warning?: string;
}

export interface OrchestrationPolicy {
  minRecoveryEvents: number;
  failureTolerance: number;
  riskClampMax: number;
  allowReopenAfterCompleted: boolean;
}

export const DEFAULT_ORCHESTRATION_POLICY: OrchestrationPolicy = {
  minRecoveryEvents: 1,
  failureTolerance: 0,
  riskClampMax: 99,
  allowReopenAfterCompleted: false,
};
