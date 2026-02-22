import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { RecoveryDrillMetricSample, RecoveryDrillTelemetryRunId, RecoveryDrillTenantId } from '@domain/recovery-drill-telemetry';
import { RecoveryDrillEvent, type RecoveryDrillRunSummary } from '@domain/recovery-drill-telemetry';
import type { DrillMetricQuery, DrillQueryResult } from './queries';
import { sortByReceived } from './adapter';

export interface DrillMetricsRepository {
  ingestEvent(runId: RecoveryDrillTelemetryRunId, event: RecoveryDrillEvent): Promise<void>;
  ingestMetric(runId: RecoveryDrillTelemetryRunId, sample: RecoveryDrillMetricSample): Promise<void>;
  queryEvents(query: DrillMetricQuery): Promise<DrillQueryResult<RecoveryDrillEvent>>;
  queryMetrics(query: DrillMetricQuery): Promise<DrillQueryResult<RecoveryDrillMetricSample>>;
  snapshot(runId: RecoveryDrillTelemetryRunId): Promise<RecoveryDrillRunSummary | undefined>;
  upsertSummary(summary: RecoveryDrillRunSummary): Promise<void>;
}

export class InMemoryDrillMetricsRepository implements DrillMetricsRepository {
  private readonly eventStore = new Map<RecoveryDrillTelemetryRunId, RecoveryDrillEvent[]>();
  private readonly metricStore = new Map<RecoveryDrillTelemetryRunId, RecoveryDrillMetricSample[]>();
  private readonly summaryStore = new Map<RecoveryDrillTelemetryRunId, RecoveryDrillRunSummary>();
  private readonly tenantIndex = new Map<RecoveryDrillTenantId, Set<RecoveryDrillTelemetryRunId>>();

  async ingestEvent(runId: RecoveryDrillTelemetryRunId, event: RecoveryDrillEvent): Promise<void> {
    const list = this.eventStore.get(runId) ?? [];
    this.eventStore.set(runId, [...list, event]);
    const tenantRuns = this.tenantIndex.get(event.tenant) ?? new Set<RecoveryDrillTelemetryRunId>();
    tenantRuns.add(runId);
    this.tenantIndex.set(event.tenant, tenantRuns);
  }

  async ingestMetric(runId: RecoveryDrillTelemetryRunId, sample: RecoveryDrillMetricSample): Promise<void> {
    const existing = this.metricStore.get(runId) ?? [];
    this.metricStore.set(runId, [...existing, sample]);
    const runSummary = this.summaryStore.get(runId);
    if (runSummary) {
      const updated: RecoveryDrillRunSummary = {
        ...runSummary,
        metrics: runSummary.metrics + 1,
      };
      this.summaryStore.set(runId, updated);
    }
  }

  async queryEvents(query: DrillMetricQuery): Promise<DrillQueryResult<RecoveryDrillEvent>> {
    const runIds = query.runId ? [query.runId] : await this.findRunIdsByTenant(query.tenant);
    const events = runIds.flatMap((id) => this.eventStore.get(id) ?? []);
    const sorted = sortByReceived(events, (event) => event.at);

    const filtered = sorted.filter((event) => {
      if (query.kinds?.length && !query.kinds.includes(event.kind)) return false;
      if (query.severities?.length && !query.severities.includes(event.severity)) return false;
      if (query.from && event.at < query.from) return false;
      if (query.to && event.at > query.to) return false;
      return true;
    });

    const pageSize = Math.min(query.pageSize ?? filtered.length, 500);
    return {
      total: filtered.length,
      items: filtered.slice(0, pageSize),
      cursor: filtered.length > pageSize ? sorted[pageSize - 1]?.at : undefined,
    };
  }

  async queryMetrics(query: DrillMetricQuery): Promise<DrillQueryResult<RecoveryDrillMetricSample>> {
    const runIds = query.runId ? [query.runId] : await this.findRunIdsByTenant(query.tenant);
    const metrics = runIds.flatMap((id) => this.metricStore.get(id) ?? []);
    const filtered = metrics.filter((metric) => {
      if (query.from && metric.observedAt < query.from) return false;
      if (query.to && metric.observedAt > query.to) return false;
      return true;
    });

    const ordered = sortByReceived(filtered, (metric) => metric.observedAt);
    const pageSize = Math.min(query.pageSize ?? ordered.length, 500);

    return {
      total: ordered.length,
      items: ordered.slice(0, pageSize),
      cursor: ordered.length > pageSize ? ordered[pageSize - 1]?.observedAt : undefined,
    };
  }

  async snapshot(runId: RecoveryDrillTelemetryRunId): Promise<RecoveryDrillRunSummary | undefined> {
    return this.summaryStore.get(runId);
  }

  async upsertSummary(summary: RecoveryDrillRunSummary): Promise<void> {
    this.summaryStore.set(summary.runId, summary);
    let entries = this.tenantIndex.get(summary.tenant);
    if (!entries) {
      entries = new Set<RecoveryDrillTelemetryRunId>();
      this.tenantIndex.set(summary.tenant, entries);
    }
    entries.add(summary.runId);
  }

  private async findRunIdsByTenant(tenant?: RecoveryDrillTenantId): Promise<RecoveryDrillTelemetryRunId[]> {
    if (!tenant) return Array.from(this.summaryStore.keys()) as RecoveryDrillTelemetryRunId[];
    const tenantRuns = this.tenantIndex.get(tenant) ?? new Set<RecoveryDrillTelemetryRunId>();
    return [...tenantRuns];
  }
}

export class ValidationAwareDrillRepository {
  constructor(private readonly delegate: DrillMetricsRepository) {}

  async safeUpsertSummary(summary: RecoveryDrillRunSummary): Promise<Result<void, Error>> {
    if (summary.events < 0 || summary.metrics < 0) {
      return fail(new Error('invalid-summary-counts'));
    }
    await this.delegate.upsertSummary(summary);
    return ok(undefined);
  }
}
