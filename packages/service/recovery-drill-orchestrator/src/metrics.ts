import type { DrillRunRecord, DrillTemplateRecord } from '@data/recovery-drill-store/src';
import type { RecoveryDrillTenantId } from '@domain/recovery-drill/src';
import { summarizeTemplateHeatpoints } from '@domain/recovery-drill/src/telemetry';
import { createRunBundle } from '@domain/recovery-drill/src/adapters';
import { buildRiskCatalog, riskFromTemplatesAndRuns } from '@domain/recovery-drill/src/risk';

export interface DrillServiceMetrics {
  readonly tenant: RecoveryDrillTenantId;
  readonly totalTemplates: number;
  readonly activeRuns: number;
  readonly queuedRuns: number;
  readonly successRate: number;
  readonly riskIndex: number;
  readonly topHeatpointTemplate: string | undefined;
}

export interface DrillServiceMetricRow {
  readonly templateId: string;
  readonly runCount: number;
  readonly averageSuccess: number;
  readonly trend: 'up' | 'down' | 'flat';
}

export interface DrillServiceOverview {
  readonly byTenant: ReadonlyMap<string, DrillServiceMetrics>;
  readonly heatpoints: readonly DrillServiceMetricRow[];
  readonly riskByTenant: {
    readonly tenant: string;
    readonly riskIndex: number;
    readonly activeScore: number;
    readonly templateCoverage: number;
  }[];
}

interface TemplateHeatpoint {
  readonly templateId: string;
  readonly runCount: number;
  readonly avgSuccess: number;
  readonly trend: 'up' | 'down' | 'flat';
}

interface RecoveryRunLike {
  readonly id: string;
  readonly templateId: string;
  readonly status: DrillRunRecord['status'];
  readonly mode: DrillRunRecord['mode'];
  readonly profile: DrillRunRecord['profile'];
  readonly checkpoints: readonly string[];
}

const toTelemetryRuns = (runs: readonly DrillRunRecord[]): readonly RecoveryRunLike[] =>
  runs.map((run) => ({
    id: run.id,
    templateId: run.templateId,
    status: run.status,
    mode: run.mode,
    profile: run.profile,
    checkpoints: run.checkpoints,
  }));

export const summarizeMetricRows = (
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
): readonly DrillServiceMetricRow[] => {
  const templateRows = summarizeTemplateHeatpoints(
    templates.map((template) => ({ templateId: template.templateId, tenantId: template.tenantId })),
    toTelemetryRuns(runs),
  );
  return templateRows.map((heatpoint: TemplateHeatpoint) => ({
    templateId: heatpoint.templateId,
    runCount: heatpoint.runCount,
    averageSuccess: heatpoint.avgSuccess,
    trend: heatpoint.trend,
  }));
};

export const computeTenantMetrics = (
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
  tenantId: RecoveryDrillTenantId,
): DrillServiceMetrics => {
  const tenantTemplates = templates.filter((template) => template.tenantId === tenantId);
  const tenantRuns = runs.filter((run) => tenantTemplates.some((item) => item.templateId === run.templateId));

  const bundle = createRunBundle(tenantRuns);
  const activeRuns = tenantRuns.filter((run) => run.status === 'queued' || run.status === 'running').length;
  const queuedRuns = tenantRuns.filter((run) => run.status === 'queued').length;
  const heatpoints = summarizeMetricRows(tenantTemplates, tenantRuns);
  const topHeatpoint = heatpoints
    .filter((item) => item.runCount > 0)
    .sort((left, right) => right.averageSuccess - left.averageSuccess)[0];
  const risks = riskFromTemplatesAndRuns(
    tenantTemplates.map((template) => ({ tenantId: template.tenantId, templateId: template.templateId })),
    tenantRuns.map((run) => ({
      id: run.id,
      templateId: run.templateId,
      status: run.status,
      mode: run.mode,
      profile: run.profile,
      checkpoints: run.checkpoints.map((value) => ({ at: value, stepId: 'unknown', status: 'warned', durationMs: 0 })),
      context: {
        runId: run.id,
        templateId: run.templateId,
        runAt: run.startedAt ?? new Date().toISOString(),
        initiatedBy: 'system',
        mode: run.mode,
        approvals: 0,
      },
    })),
  );
  const riskEntry = risks.find((entry) => entry.tenant === tenantId);

  return {
    tenant: tenantId,
    totalTemplates: tenantTemplates.length,
    activeRuns,
    queuedRuns,
    successRate: bundle.successRate,
    riskIndex: riskEntry?.riskIndex ?? 0,
    topHeatpointTemplate: topHeatpoint?.templateId,
  };
};

export const buildServiceOverview = (
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
): DrillServiceOverview => {
  const byTenant = new Map<string, DrillServiceMetrics>();
  const tenants = new Set<RecoveryDrillTenantId>(templates.map((item) => item.tenantId));

  for (const tenant of tenants) {
    byTenant.set(tenant, computeTenantMetrics(templates, runs, tenant));
  }

  const heatpoints = summarizeMetricRows(templates, runs);
  const riskByTenant = riskFromTemplatesAndRuns(
    templates.map((template) => ({ tenantId: template.tenantId, templateId: template.templateId })),
    runs.map((run) => ({
      id: run.id,
      templateId: run.templateId,
      status: run.status,
      mode: run.mode,
      profile: run.profile,
      checkpoints: run.checkpoints.map((value) => ({ at: value, stepId: 'unknown', status: 'warned', durationMs: 0 })),
      context: {
        runId: run.id,
        templateId: run.templateId,
        runAt: run.startedAt ?? new Date().toISOString(),
        initiatedBy: 'system',
        mode: run.mode,
        approvals: 0,
      },
    })),
  ).map((entry) => ({
    tenant: entry.tenant,
    riskIndex: entry.riskIndex,
    activeScore: entry.activeScore,
    templateCoverage: entry.templateCoverage,
  }));

  const catalog = buildRiskCatalog(templates.map((template) => template.template));
  void catalog;

  return { byTenant, heatpoints, riskByTenant };
};
