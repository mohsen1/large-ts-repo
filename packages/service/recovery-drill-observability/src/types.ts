import type {
  RecoveryDrillRunSummary,
  RecoveryDrillTelemetryRunId,
  RecoveryDrillTenantId,
} from '@domain/recovery-drill-telemetry';
import type { DrillMetricQuery } from '@data/recovery-drill-metrics/src/queries';

export interface IngestInput {
  readonly runId: RecoveryDrillTelemetryRunId;
  readonly tenant: RecoveryDrillTenantId;
  readonly source: string;
  readonly raw: unknown;
}

export interface DrillAlert {
  readonly runId: RecoveryDrillTelemetryRunId;
  readonly tenant: RecoveryDrillTenantId;
  readonly reason: string;
  readonly urgent: boolean;
}

export interface DrillObservabilityConfig {
  readonly archiveBucket?: string;
  readonly notificationTopic?: string;
  readonly dryRun?: boolean;
}

export interface DrillObservabilityQueries {
  readonly metrics: (query: DrillMetricQuery) => Promise<{ items: readonly unknown[]; total: number }>;
  readonly summaryByTenant: (tenant: RecoveryDrillTenantId) => Promise<readonly RecoveryDrillRunSummary[]>;
}
