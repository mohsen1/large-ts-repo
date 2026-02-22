import type { RecoveryDrillTenantId, RecoveryDrillTelemetryRunId } from '@domain/recovery-drill-telemetry';
import type { RecoverySignalSeverity } from '@domain/recovery-drill-telemetry';

export interface DrillMetricQuery {
  readonly tenant?: RecoveryDrillTenantId;
  readonly runId?: RecoveryDrillTelemetryRunId;
  readonly kinds?: readonly string[];
  readonly severities?: readonly RecoverySignalSeverity[];
  readonly from?: string;
  readonly to?: string;
  readonly pageSize?: number;
  readonly next?: string;
}

export interface DrillQueryResult<T> {
  readonly items: readonly T[];
  readonly cursor?: string;
  readonly total: number;
}
