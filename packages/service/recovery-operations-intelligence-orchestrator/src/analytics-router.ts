import type { OperationsAnalyticsReport, MetricWindowContext } from '@data/recovery-operations-analytics';
import {
  buildOperationsReport,
  buildSnapshotEnvelope,
  emitSummary,
  type AnalyticsAdapter,
  type SummaryFormatter,
  routeSummaryReport,
  type MetricEnvelope,
  createAdapterChain,
} from '@data/recovery-operations-analytics';
import { withBrand } from '@shared/core';
import type { OrchestrationEvent } from './orchestration-types';
import type { RecoverySignal } from '@domain/recovery-operations-models';
import type { RunAssessment, CohortSignalAggregate } from '@domain/recovery-operations-intelligence';

export interface AnalyticsPublishContext {
  readonly tenant: string;
  readonly runId: string;
  readonly signals: readonly RecoverySignal[];
  readonly assessments: readonly RunAssessment[];
  readonly cohort: readonly CohortSignalAggregate[];
}

interface PublishResult {
  readonly tenant: string;
  readonly runId: string;
  readonly report: OperationsAnalyticsReport;
  readonly envelope: MetricEnvelope<unknown>;
  readonly events: readonly OrchestrationEvent[];
}

interface PublishableAdapter {
  publishReport(report: OperationsAnalyticsReport): Promise<void>;
  publishSnapshot(snapshot: MetricEnvelope<unknown>): Promise<void>;
}

const formatter: SummaryFormatter = {
  formatOverview: (report) => `${report.tenant}:${report.signalDensity[0]?.runId ?? 'n/a'}:${report.signalDensity.length}`,
  formatRunDensity: (report) =>
    report.signalDensity
      .map((item) => `${item.runId}=${item.signalCount}`)
      .join(', '),
};

export const toReportWindow = (): MetricWindowContext => ({
  from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  to: new Date().toISOString(),
  zone: 'UTC',
  kind: 'hour',
});

export const buildOperationsEvents = (report: OperationsAnalyticsReport, runId: string): readonly OrchestrationEvent[] => {
  const overview = formatter.formatOverview(report);
  const density = formatter.formatRunDensity(report);
  const now = new Date().toISOString();
  return [
    {
      eventId: `${report.tenant}-${runId}`,
      tenant: withBrand(report.tenant, 'TenantId'),
      kind: 'report',
      issuedAt: now,
      payload: {
        tenant: report.tenant,
        overview,
      },
    },
    {
      eventId: `${report.tenant}-${runId}-${report.signalDensity.length}`,
      tenant: withBrand(report.tenant, 'TenantId'),
      kind: 'decision',
      issuedAt: now,
      payload: {
        density,
        riskBands: report.riskBands,
      },
    },
  ];
};

export const publishAnalyticsBundle = async (
  input: AnalyticsPublishContext,
  adapters: readonly AnalyticsAdapter[] = [],
): Promise<PublishResult> => {
  const report = buildOperationsReport({
    tenant: input.tenant,
    signals: input.signals,
    sessions: [],
    decisions: [],
    assessments: input.assessments,
  });

  const envelope = buildSnapshotEnvelope(input.tenant, `${input.runId}/analytics/report`, {
    runId: input.runId,
    cohorts: input.cohort,
    summary: formatter.formatOverview(report),
  }, toReportWindow());

  const chain = createAdapterChain(adapters);
  const events = buildOperationsEvents(report, input.runId);
  await routeSummaryReport(report, [chain]);
  await chain.publishSnapshot(envelope);
  emitSummary(report, formatter, {
    emit: (line) => {
      void line;
    },
  });

  return {
    tenant: input.tenant,
    runId: input.runId,
    report,
    envelope,
    events,
  };
};

export const buildPublishAdapters = (
  adapters: readonly PublishableAdapter[],
): readonly AnalyticsAdapter[] =>
  adapters.length === 0
    ? []
    : adapters.map((adapter) => ({
        publishReport: async (report) => {
          await adapter.publishReport(report);
        },
        publishSnapshot: async (snapshot) => {
          await adapter.publishSnapshot(snapshot);
        },
      }));
