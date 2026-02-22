import type { DrillTemplateRecord, DrillRunRecord } from '@data/recovery-drill-store/src';
import type { DrillTemplate, RecoveryDrillTenantId, RecoveryDrillRunId, RecoveryDrillTemplateId } from '@domain/recovery-drill/src';
import { clusterByTemplate, summarizeTemplateDrift } from '@domain/recovery-drill/src/forensics';
import { buildCommandBuckets } from '@domain/recovery-drill/src/command-metrics';

export interface DriftSignal {
  readonly templateId: string;
  readonly averageDurationMs: number;
  readonly risk: number;
}

export interface RunForecastPoint {
  readonly runId: RecoveryDrillRunId;
  readonly templateId: RecoveryDrillTemplateId;
  readonly predictedMs: number;
  readonly confidence: number;
}

export interface ForecastResult {
  readonly tenantId: string;
  readonly at: string;
  readonly points: readonly RunForecastPoint[];
  readonly driftSignals: readonly DriftSignal[];
  readonly topRiskBuckets: readonly string[];
}

const riskFromTemplate = (template: DrillTemplate): number =>
  template.scenarios.reduce((acc, scenario) => acc + scenario.owners.length + scenario.prerequisites.length, 0);

const predictDuration = (run: DrillRunRecord): number => {
  if (run.profile.estimatedMs > 0) return run.profile.estimatedMs;
  if (run.checkpoints.length === 0) return 30_000;
  return run.checkpoints.length * 20_000;
};

export const forecastRuns = (
  tenantId: RecoveryDrillTenantId,
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
): ForecastResult => {
  const metrics = buildCommandBuckets({
    tenantId,
    templates: templates.map((item) => item.template),
    filter: { tenant: tenantId },
    mode: 'tabletop',
  });

  const bundle = clusterByTemplate(
    tenantId,
    runs.map((run) => ({
      id: run.id,
      templateId: run.templateId,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      checkpoints: run.checkpoints,
      context: run.context ? { mode: run.context.mode } : undefined,
    })),
    templates.map((template) => ({ templateId: template.templateId, mode: template.template.mode })),
  );

  const driftBuckets = summarizeTemplateDrift(bundle);

  const points: RunForecastPoint[] = runs.map((run) => {
    const template = templates.find((candidate) => candidate.templateId === run.templateId)?.template;
    const baseMs = template ? predictDuration(run) : run.profile.estimatedMs;
    const complexity = template ? riskFromTemplate(template) : 1;
    const confidence = template ? Math.min(0.99, Math.max(0.35, 1 - complexity / 20)) : 0.5;
    return {
      runId: run.id,
      templateId: run.templateId,
      predictedMs: Math.round(baseMs * (1 + complexity / 50)),
      confidence,
    };
  });

  const topRiskBuckets = metrics.buckets
    .filter((bucket) => bucket.weightedScore > 10)
    .map((bucket) => bucket.key);

  const driftSignals: DriftSignal[] = Object.entries(driftBuckets).map(([templateId, averageDurationMs]) => ({
    templateId,
    averageDurationMs,
    risk: Number((averageDurationMs / 1000).toFixed(3)),
  }));

  return {
    tenantId,
    at: new Date().toISOString(),
    points,
    driftSignals,
    topRiskBuckets,
  };
};
