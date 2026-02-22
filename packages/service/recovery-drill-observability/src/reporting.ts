import { aggregateHealth, computeHealthScore } from '@domain/recovery-drill-telemetry/src/analysis';
import { InMemoryDrillMetricsRepository, type DrillMetricsRepository } from '@data/recovery-drill-metrics/src/repository';
import type { RecoveryDrillTenantId, RecoveryDrillRunSummary } from '@domain/recovery-drill-telemetry';
import { normalizeRunState } from '@domain/recovery-drill-telemetry/src/schema';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

export class DrillReportingService {
  private readonly repository: DrillMetricsRepository | InMemoryDrillMetricsRepository;

  constructor(repository: DrillMetricsRepository | InMemoryDrillMetricsRepository) {
    this.repository = repository;
  }

  async tenantSnapshot(tenant: RecoveryDrillTenantId): Promise<Result<readonly RecoveryDrillRunSummary[], Error>> {
    const summaryQuery = await this.repository.queryMetrics({ tenant, pageSize: 5000 });
    if (!summaryQuery) {
      return fail(new Error('metrics-store-empty'));
    }

    const events = await this.repository.queryEvents({ tenant, pageSize: 5000 });
    const scores = new Map<string, RecoveryDrillRunSummary>();

    for (const event of events.items) {
      const record = event as any;
      const existing = scores.get(record.runId);
      if (!existing) {
        continue;
      }

      const status = normalizeRunState(record.status ?? 'running');
      scores.set(record.runId, {
        ...(existing as RecoveryDrillRunSummary),
        status: status as any,
      });
    }

    return ok(Array.from(scores.values()));
  }

  scoreRun(summary: RecoveryDrillRunSummary): number {
    return computeHealthScore(
      summary.stepHealth.flatMap(() => []),
    );
  }

  prioritizeRuns(items: readonly RecoveryDrillRunSummary[]): RecoveryDrillRunSummary[] {
    return [...items].sort((a, b) => {
      if (a.healthScore === b.healthScore) {
        return b.criticalHits - a.criticalHits;
      }
      return b.healthScore - a.healthScore;
    });
  }
}
