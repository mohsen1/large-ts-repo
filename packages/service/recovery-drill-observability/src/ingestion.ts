import { computeHealthScore, normalizeToTimeline } from '@domain/recovery-drill-telemetry';
import { parseIncomingEvent, parseIncomingMetric, buildEnvelope, aggregateHealth as aggregateHealthFromSamples } from '@data/recovery-drill-metrics/src/adapter';
import { normalizeRunState, scoreBySeverity } from '@data/recovery-drill-metrics/src/adapter';
import { computeHealthScore as scoreHealth, normalizeToTimeline as buildTimeline } from '@domain/recovery-drill-telemetry';
import { InMemoryDrillMetricsRepository } from '@data/recovery-drill-metrics/src/repository';
import { parseRunState } from '@domain/recovery-drill-telemetry';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type {
  RecoveryDrillEvent,
  RecoveryDrillMetricSample,
  RecoveryDrillRunSummary,
  RecoveryDrillTelemetryRunId,
  RecoveryDrillTenantId,
  RecoveryDrillScenarioId,
  RecoveryDrillTimelinePoint,
  RecoverySignalSeverity,
} from '@domain/recovery-drill-telemetry';
import type { DrillMetricQuery } from '@data/recovery-drill-metrics/src/queries';
import { DrillS3Archive, DrillSnsNotifier, NullDrillNotifier } from '@infrastructure/recovery-drill-archive';
import type { DrillObservabilityConfig } from './types';
import { computeHealthScore as computeSummaryHealth } from '@domain/recovery-drill-telemetry';

export class RecoveryDrillIngestionService {
  private readonly archive?: DrillS3Archive;
  private readonly notifier?: DrillSnsNotifier | NullDrillNotifier;

  constructor(
    private readonly repository: InMemoryDrillMetricsRepository,
    config: DrillObservabilityConfig = {},
  ) {
    if (config.archiveBucket) {
      this.archive = new DrillS3Archive({ bucket: config.archiveBucket });
    }

    if (config.notificationTopic) {
      this.notifier = new DrillSnsNotifier(config.notificationTopic);
    } else {
      this.notifier = new NullDrillNotifier();
    }
  }

  async ingest(input: { runId: RecoveryDrillTelemetryRunId; raw: unknown }): Promise<Result<RecoveryDrillRunSummary, Error>> {
    const { envelopeId, parsed } = parseIncomingEvent(input.raw);
    await this.repository.ingestEvent(input.runId, parsed);

    const events = await this.repository.queryEvents({ runId: input.runId, pageSize: 1000 });
    const severity: RecoverySignalSeverity = (parsed as RecoveryDrillEvent).severity ?? 'info';

    if (severity === 'critical' || severity === 'error') {
      const summary = await this.rebuildSummary(input.runId);
      if (this.notifier) {
        await this.notifier.publish({
          summary,
          archived: false,
          route: 'sns',
          topicArn: undefined,
        } as any);
      }
      return ok(summary);
    }

    return ok((await this.rebuildSummary(input.runId)));
  }

  async ingestMetric(input: { runId: RecoveryDrillTelemetryRunId; raw: unknown }): Promise<Result<RecoveryDrillRunSummary, Error>> {
    const metric = parseIncomingMetric(input.raw);
    await this.repository.ingestMetric(input.runId, metric);
    const summary = await this.rebuildSummary(input.runId);
    return ok(summary);
  }

  async queryEvents(query: DrillMetricQuery) {
    return this.repository.queryEvents(query);
  }

  private async rebuildSummary(runId: RecoveryDrillTelemetryRunId): Promise<RecoveryDrillRunSummary> {
    const metrics = await this.repository.queryMetrics({ runId, pageSize: 2000 });
    const events = await this.repository.queryEvents({ runId, pageSize: 2000 });

    const timeline: RecoveryDrillTimelinePoint[] = [];
    for (const event of events.items) {
      const eventAsAny = event as unknown as RecoveryDrillEvent;
      timeline.push({
        at: eventAsAny.at,
        value: severityToScore(eventAsAny.severity),
        source: eventAsAny.kind,
      });
    }
    const timelineDigest = buildTimeline(timeline);
    const metricsHealth = aggregateHealthFromSamples(metrics.items).map((metric) => ({
      ...metric,
      unit: metric.unit,
      baseline: metric.baseline,
      name: metric.name,
      current: metric.current,
      minSafe: metric.minSafe,
      maxSafe: metric.maxSafe,
    }));
    const criticalHits = events.items.filter((entry) => (entry as RecoveryDrillEvent).severity === 'critical').length;
    const firstEvent = events.items.at(0);
    const envelope = buildEnvelope('recovery-drill-summary', {
      runId,
      tenant: (firstEvent?.tenant ?? 'unknown') as RecoveryDrillTenantId,
      scenarioId: (firstEvent?.scenarioId ?? '') as RecoveryDrillScenarioId,
      status: (firstEvent?.kind === 'transition' ? parseRunState('running') : 'running') as any,
      events: events.total,
      metrics: metrics.total,
      criticalHits,
      healthScore: computeSummaryHealth(metricsHealth as any),
      latencyP95Ms: timelineDigest.avg,
      stepHealth: [],
    });

    const summary: RecoveryDrillRunSummary = envelope.body;
    await this.repository.upsertSummary(summary);

    if (this.archive && criticalHits > 2) {
      await this.archive.putSummary(runId, summary);
    }

    return summary;
  }
}

const severityToScore = (value: RecoverySignalSeverity): number => {
  switch (value) {
    case 'critical':
      return 100;
    case 'error':
      return 75;
    case 'degrade':
      return 50;
    case 'warn':
      return 25;
    default:
      return 5;
  }
};
