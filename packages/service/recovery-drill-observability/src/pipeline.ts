import type { DrillMetricQuery } from '@data/recovery-drill-metrics/src/queries';
import type { RecoverySignalSeverity } from '@domain/recovery-drill-telemetry';
import { RecoveryDrillIngestionService } from './ingestion';
import { DrillReportingService } from './reporting';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { InMemoryDrillMetricsRepository } from '@data/recovery-drill-metrics/src/repository';

export class DrillObservabilityPipeline {
  private readonly repository: InMemoryDrillMetricsRepository;
  private readonly ingestService: RecoveryDrillIngestionService;
  private readonly reportingService: DrillReportingService;

  constructor() {
    this.repository = new InMemoryDrillMetricsRepository();
    this.ingestService = new RecoveryDrillIngestionService(this.repository);
    this.reportingService = new DrillReportingService(this.repository);
  }

  async ingestUnknown(runId: string, payload: unknown): Promise<Result<string, Error>> {
    const response = await this.ingestService.ingest({ runId, raw: payload } as never);
    if (!response.ok) return fail(response.error);
    return ok(response.value.runId);
  }

  async ingestMetric(runId: string, payload: unknown): Promise<Result<string, Error>> {
    const response = await this.ingestService.ingestMetric({ runId, raw: payload } as never);
    if (!response.ok) return fail(response.error);
    return ok(response.value.runId);
  }

  async queryMetrics(query: DrillMetricQuery): Promise<Result<{ total: number; sample: readonly unknown[] }, Error>> {
    const result = await this.repository.queryMetrics(query);
    return ok({ total: result.total, sample: result.items });
  }

  async tenantSnapshot(tenant: string): Promise<Result<readonly unknown[], Error>> {
    const snapshot = await this.reportingService.tenantSnapshot(tenant as never);
    if (!snapshot.ok) return fail(snapshot.error);
    return ok(snapshot.value);
  }
}
