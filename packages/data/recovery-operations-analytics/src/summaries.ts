import type { RunSession, RecoverySignal } from '@domain/recovery-operations-models';
import type { RunAssessment } from '@domain/recovery-operations-intelligence';
import type { MetricWindowContext, OperationsAnalyticsReport, MetricEnvelope, AnalyticsAdapter } from './types';
import { calculateSignalDensity, buildWindowKey } from './aggregation';
import { withBrand } from '@shared/core';

interface ReportCursor {
  readonly runId: string;
  readonly tenant: string;
  readonly timestamp: string;
}

interface AggregateSignals {
  readonly tenant: string;
  readonly sessions: readonly RunSession[];
  readonly signals: readonly RecoverySignal[];
  readonly assessments: readonly RunAssessment[];
}

export interface SummaryFormatter {
  formatOverview(input: OperationsAnalyticsReport): string;
  formatRunDensity(input: OperationsAnalyticsReport, limit?: number): string;
}

const renderBucket = (value: number): string => value.toFixed(2);

export class HumanReadableSummaryFormatter implements SummaryFormatter {
  formatOverview(input: OperationsAnalyticsReport): string {
    const windowText = `${input.window.kind}[${input.window.from}..${input.window.to}]`;
    return [
      `tenant=${input.tenant}`,
      `window=${windowText}`,
      `coverage=${renderBucket(input.runCoverage)}`,
      `rejection=${renderBucket(input.approvals.rejectionRate * 100)}%`,
      `riskBands=${input.riskBands.green}/${input.riskBands.amber}/${input.riskBands.red}`,
    ].join(' ');
  }

  formatRunDensity(input: OperationsAnalyticsReport, limit = 5): string {
    return input.signalDensity
      .slice(0, limit)
      .map((density) => `${density.runId}:${density.signalCount}`)
      .join(', ');
  }
}

export class InMemorySummaryCursor {
  private readonly seen = new Set<string>();

  isSeen(cursor: ReportCursor): boolean {
    return this.seen.has(`${cursor.tenant}:${cursor.runId}:${cursor.timestamp}`);
  }

  markSeen(cursor: ReportCursor): void {
    this.seen.add(`${cursor.tenant}:${cursor.runId}:${cursor.timestamp}`);
  }

  reset(): void {
    this.seen.clear();
  }
}

export interface SummaryAdapter {
  emit(summary: string): void;
}

export class PrintAdapter implements SummaryAdapter {
  emit(summary: string): void {
    console.info(`[recovery-operations-analytics] ${summary}`);
  }
}

const buildContextFromReport = (report: OperationsAnalyticsReport): MetricWindowContext => report.window;

const defaultAdapter = {
  publishReport: async (_report: OperationsAnalyticsReport) => {
    await Promise.resolve();
  },
  publishSnapshot: async (_snapshot: MetricEnvelope<unknown>) => {
    await Promise.resolve();
  },
} as AnalyticsAdapter;

export const hydrateReportCursor = (
  report: OperationsAnalyticsReport,
): ReportCursor => ({
  tenant: report.tenant,
  runId: report.signalDensity[0]?.runId ?? `${report.tenant}-run`,
  timestamp: report.createdAt,
});

export const summarizeAggregateSignals = (input: AggregateSignals): OperationsAnalyticsReport => {
  const groupedByTenant = new Map<string, { sessions: RunSession[]; signals: RecoverySignal[]; assessments: RunAssessment[] }>();

  const aggregateSignals: { sessions: RunSession[]; signals: RecoverySignal[]; assessments: RunAssessment[] } = {
    sessions: [...input.sessions],
    signals: [...input.signals],
    assessments: [...input.assessments],
  };
  groupedByTenant.set(input.tenant, aggregateSignals);

  const [first] = [...groupedByTenant.entries()];
  const [tenant, payload] = first;
  const context: MetricWindowContext = {
    from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
    zone: 'UTC',
    kind: 'hour',
  };

  return {
    tenant,
    window: context,
    signalDensity: payload.sessions.map((session) => calculateSignalDensity(
      String(session.runId),
      input.tenant,
      session.signals,
    )),
    scoreTrend: {
      direction: payload.signals.length > 10 ? 'rising' : payload.signals.length > 5 ? 'flat' : 'falling',
      points: payload.signals.map((signal, index) => ({
        timestamp: new Date(Date.now() - index * 60_000).toISOString(),
        value: signal.severity,
      })),
    },
    runCoverage: payload.sessions.length ? payload.assessments.length / payload.sessions.length : 0,
    approvals: {
      total: payload.assessments.length,
      accepted: payload.assessments.filter((assessment) => assessment.confidence > 0.75).length,
      rejectionRate: 0,
    },
    riskBands: {
      green: payload.assessments.filter((assessment) => assessment.bucket === 'low' || assessment.bucket === 'medium').length,
      amber: payload.assessments.filter((assessment) => assessment.bucket === 'high').length,
      red: payload.assessments.filter((assessment) => assessment.bucket === 'critical').length,
    },
    createdAt: new Date().toISOString(),
  };
};

export const buildSnapshotEnvelope = <T>(
  tenant: string,
  metric: string,
  payload: T,
  window: MetricWindowContext,
): MetricEnvelope<T> => {
  const key = buildWindowKey(tenant, window);
  return {
    key,
    tenant: withBrand(tenant, 'TenantId'),
    metric: withBrand(metric, 'MetricName'),
    context: window,
    payload,
    generatedAt: new Date().toISOString(),
  };
};

export const emitSummary = (
  report: OperationsAnalyticsReport,
  formatter: SummaryFormatter,
  adapter: SummaryAdapter,
): void => {
  const summary = formatter.formatOverview(report);
  adapter.emit(summary);
};

export const routeSummaryReport = async (
  report: OperationsAnalyticsReport,
  adapters: readonly AnalyticsAdapter[] = [defaultAdapter],
): Promise<void> => {
  const context = buildContextFromReport(report);
  const envelope = buildSnapshotEnvelope(report.tenant, 'operations/aggregate', report, context);
  await Promise.all(adapters.map((adapter) => adapter.publishReport(report)));
  await Promise.all(adapters.map((adapter) => adapter.publishSnapshot(envelope)));
};
