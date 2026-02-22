import type {
  RecoveryDrillEnvelope,
  RecoveryDrillEvent,
  RecoveryDrillMetricSample,
  RecoveryDrillRunSummary,
  RecoverySignalSeverity,
} from '@domain/recovery-drill-telemetry';

export interface RunDigestRecord {
  readonly runId: RecoveryDrillEnvelope<RecoveryDrillRunSummary>['body']['runId'];
  readonly summary: RecoveryDrillRunSummary;
  readonly createdAt: string;
}

export interface EventRecord {
  readonly envelope: RecoveryDrillEnvelope<RecoveryDrillEvent>;
  readonly severity: RecoverySignalSeverity;
  readonly eventAt: string;
}

export interface MetricRecord {
  readonly envelope: RecoveryDrillEnvelope<RecoveryDrillMetricSample>;
  readonly observedAt: string;
}

export interface DrillWindow {
  readonly start: string;
  readonly end: string;
  readonly stepRunIds: readonly string[];
}

export interface DrillStorageIndex {
  readonly byTenant: Map<string, Set<string>>;
  readonly byRun: Map<string, Set<string>>;
  readonly byScenario: Map<string, Set<string>>;
}
