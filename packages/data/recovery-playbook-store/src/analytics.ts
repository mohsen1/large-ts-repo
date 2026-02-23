import { withBrand } from '@shared/core';
import { err, fail, ok, type Result } from '@shared/result';
import type { RecoveryPlaybook, PlaybookExecutionReport } from '@domain/recovery-playbooks';
import type { Brand } from '@shared/type-level';
import { toExecutionReport } from '@domain/recovery-playbooks/portfolio';
import type { PlaybookTelemetryAggregate } from '@domain/recovery-playbooks/telemetry';
import type { PaginatedPage, RecoveryPlaybookRepository, PlaybookQueryCursor, PlaybookEnvelope } from './repository';

export type PlaybookAnalyticsId = Brand<string, 'PlaybookAnalyticsId'>;

export interface PortfolioAnalyticsWindow {
  readonly start: string;
  readonly end: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly averageMinutes: number;
  readonly medianMinutes: number;
}

export interface PlaybookAnalyticsSnapshot {
  readonly id: PlaybookAnalyticsId;
  readonly portfolioId: string;
  readonly tenantId: string;
  readonly tenantWindow: PortfolioAnalyticsWindow;
  readonly snapshots: readonly PlaybookExecutionReport[];
  readonly telemetry: readonly PlaybookTelemetryAggregate[];
}

export interface PlaybookAnalyticsRepository {
  append(portfolioId: string, report: PlaybookExecutionReport): Promise<Result<void, string>>;
  getSnapshots(portfolioId: string): Promise<Result<readonly PlaybookExecutionReport[], string>>;
  aggregate(portfolioId: string): Promise<Result<PortfolioAnalyticsWindow, string>>;
  exportCsv(portfolioId: string): Promise<Result<string, string>>;
}

interface IndexedReport {
  readonly id: PlaybookAnalyticsId;
  readonly report: PlaybookExecutionReport;
}

const clamp = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return value;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[center];
  return (sorted[center - 1] + sorted[center]) / 2;
};

export const formatCsvRow = (report: PlaybookExecutionReport): string[] => [
  String(report.run.id),
  String(report.run.playbookId),
  String(report.run.status),
  String(report.elapsedMinutes),
  String(report.warnings.length),
  String(report.errors.length),
];

export class InMemoryPlaybookAnalyticsStore implements PlaybookAnalyticsRepository {
  private readonly reportsByPortfolio = new Map<string, IndexedReport[]>();

  async append(portfolioId: string, report: PlaybookExecutionReport): Promise<Result<void, string>> {
    const id = withBrand(`${portfolioId}:${Date.now()}:${report.run.id}`, 'PlaybookAnalyticsId');
    const bucket = this.reportsByPortfolio.get(portfolioId) ?? [];
    bucket.push({ id, report });
    this.reportsByPortfolio.set(portfolioId, bucket);
    return ok(undefined);
  }

  async getSnapshots(portfolioId: string): Promise<Result<readonly PlaybookExecutionReport[], string>> {
    const bucket = this.reportsByPortfolio.get(portfolioId);
    if (!bucket) return ok([]);
    return ok(bucket.map((entry) => entry.report));
  }

  async aggregate(portfolioId: string): Promise<Result<PortfolioAnalyticsWindow, string>> {
    const records = this.reportsByPortfolio.get(portfolioId) ?? [];
    if (records.length === 0) return fail('analytics-has-no-reports');

    const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
    const durations = sorted.map((entry) => entry.report.elapsedMinutes);
    const completions = sorted.filter((entry) =>
      ['completed', 'aborted'].includes(entry.report.run.status),
    ).length;
    const failures = sorted.filter((entry) => entry.report.run.status === 'failed').length;
    return ok({
      start: String(sorted.at(0)?.report.run.startedAt ?? ''),
      end: String(sorted.at(-1)?.report.run.completedAt ?? ''),
      runCount: sorted.length,
      completedCount: completions,
      failedCount: failures,
      averageMinutes: durations.reduce((acc, value) => acc + clamp(value), 0) / Math.max(1, durations.length),
      medianMinutes: median(durations),
    });
  }

  async exportCsv(portfolioId: string): Promise<Result<string, string>> {
    const snapshots = await this.getSnapshots(portfolioId);
    if (!snapshots.ok) return fail(snapshots.error);
    if (snapshots.value.length === 0) return ok('');
    const rows = snapshots.value.map((snapshot) => formatCsvRow(snapshot));
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    return ok(csv);
  }
}

export class RecoveryPlaybookArchiveService {
  constructor(
    private readonly repository: RecoveryPlaybookRepository,
    private readonly analytics: PlaybookAnalyticsRepository = new InMemoryPlaybookAnalyticsStore(),
  ) {}

  async reconcile(query: {
    readonly portfolioId: string;
    readonly tenantId: string;
  }): Promise<Result<PlaybookAnalyticsSnapshot, string>> {
    const catalog = await this.repository.query({
      tenantId: withBrand(query.tenantId, 'TenantId'),
      status: 'published',
      limit: 200,
    });
    if (!catalog.ok) return fail(catalog.error);

    const samples = await this.analytics.getSnapshots(query.portfolioId);
    if (!samples.ok) return fail(samples.error);
    const telemetry = samples.value.flatMap((report) => toExecutionReport(report.run, report.elapsedMinutes, report.warnings));
    const aggregate = await this.analytics.aggregate(query.portfolioId);
    if (!aggregate.ok) return fail(aggregate.error);

    return ok({
      id: withBrand(`${query.portfolioId}:snapshot:${Date.now()}`, 'PlaybookAnalyticsId'),
      portfolioId: query.portfolioId,
      tenantId: query.tenantId,
      tenantWindow: aggregate.value,
      snapshots: samples.value,
      telemetry: telemetry.map((report, index) => ({
        portfolioId: query.portfolioId,
        tenant: query.tenantId,
        windowStart: String(report.run.startedAt ?? aggregate.value.start),
        windowEnd: String(report.run.completedAt ?? aggregate.value.end),
        points: [
          {
            bucket: withBrand(`${query.portfolioId}:${index}`, 'TelemetryBucket'),
            at: report.run.startedAt ?? new Date().toISOString(),
            playbookId: String(report.run.playbookId),
            selected: 1,
            completed: report.warnings.length > 0 ? 0 : 1,
            skipped: 0,
            failed: report.errors.length,
            avgLatencyMinutes: report.elapsedMinutes,
          },
        ],
        summary: {
          runCount: 1,
          completionRate: 1,
          failRate: 0,
          avgLatencyMinutes: report.elapsedMinutes,
        },
      })),
    });
  }

  async publishReport(
    playbook: RecoveryPlaybook,
    portfolioId: string,
  ): Promise<Result<PlaybookExecutionReport, string>> {
    const envelope: PlaybookExecutionReport = {
      run: {
        id: withBrand(`envelope:${playbook.id}:${Date.now()}`, 'RecoveryPlanId'),
        runId: withBrand(`run:${playbook.id}`, 'RecoveryRunId'),
        playbookId: playbook.id,
        status: 'completed',
        selectedStepIds: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date(Date.now() + playbook.steps.length * 60_000).toISOString(),
        operator: 'archive-service',
        telemetry: {
          attempts: playbook.steps.length,
          failures: 0,
          recoveredStepIds: playbook.steps.map((step) => step.id),
        },
      },
      warnings: [],
      errors: [],
      elapsedMinutes: playbook.steps.length,
    };
    const appended = await this.analytics.append(portfolioId, envelope);
    if (!appended.ok) return fail(appended.error);
    return ok(envelope);
  }

  async indexCatalog(
    cursor: PlaybookQueryCursor | undefined,
  ): Promise<Result<PaginatedPage<PlaybookEnvelope>, string>> {
    const query = {
      status: 'published' as const,
      limit: 20,
      cursor,
    };
    return this.repository.query(query);
  }
}

export const summarizePortfolioReports = async (
  analytics: PlaybookAnalyticsRepository,
  portfolioId: string,
): Promise<Result<readonly PlaybookExecutionReport[], string>> => {
  const snapshots = await analytics.getSnapshots(portfolioId);
  if (!snapshots.ok) return fail(snapshots.error);
  return ok(snapshots.value);
};
