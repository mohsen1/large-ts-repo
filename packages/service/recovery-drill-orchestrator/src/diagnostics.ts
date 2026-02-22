import type { DrillTemplateRecord, DrillRunRecord, DrillStoreQuery } from '@data/recovery-drill-store/src';
import type { DrillRunPlan } from './types';
import type { DrillProgressEvent } from './types';
import { summarizeMetricRows } from './metrics';
import { buildPlan } from './planner';
import { toPolicyEnvelope } from '@domain/recovery-drill/src/policy';
import type { DrillTemplate, RecoveryDrillTenantId } from '@domain/recovery-drill/src';

export interface DiagnosisRule {
  readonly code: string;
  readonly templateId: string;
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface RunDiagnosis {
  readonly runId: string;
  readonly summary: readonly DiagnosisRule[];
  readonly envelopeSize: number;
  readonly trend: 'stable' | 'risky' | 'unknown';
}

export interface HealthMatrix {
  readonly tenant: string;
  readonly templateId: string;
  readonly diagnostics: readonly RunDiagnosis[];
}

const assessPlan = (plan: DrillRunPlan): 'stable' | 'risky' | 'unknown' => {
  if (!plan.scenarioOrder.length) return 'unknown';
  if (plan.concurrency > 4) return 'risky';
  if (plan.scenarioOrder.length > 8) return 'risky';
  return 'stable';
};

const buildEventEnvelope = (status: DrillProgressEvent['status'], runId: string): number => {
  return toPolicyEnvelope({
    tenantId: 'diagnostics' as never,
    templateId: runId as never,
    action: status === 'running' ? 'approve' : 'hold',
    score: 0,
    mode: 'tabletop',
    gates: [],
    notes: [],
  }).length;
};

export const diagnoseTemplate = (
  template: DrillTemplate,
  runs: readonly DrillRunRecord[],
): HealthMatrix => {
  const diagnostics = runs.map((run) => {
    const context = run.context;
    const plan = buildPlan({
      context: context ?? {
        runId: run.id,
        templateId: template.id,
        runAt: new Date().toISOString(),
        initiatedBy: 'diagnostics' as never,
        mode: template.mode,
        approvals: template.defaultApprovals,
      },
      template,
      activeRuns: runs.length,
    });
    const summary: DiagnosisRule[] = [];
    if (run.status === 'failed') {
      summary.push({ code: 'failed-run', templateId: template.id, message: 'run ended with failed status', severity: 'high' });
    }
    if (run.profile.successRate < 0.4) {
      summary.push({ code: 'low-success-rate', templateId: template.id, message: 'success-rate below threshold', severity: 'medium' });
    }
    if (run.checkpoints.length === 0) {
      summary.push({ code: 'silent-run', templateId: template.id, message: 'no checkpoints emitted', severity: 'low' });
    }
    return {
      runId: run.id,
      summary,
      envelopeSize: buildEventEnvelope(run.status, run.id),
      trend: assessPlan(plan),
    };
  });

  return {
    tenant: template.tenantId,
    templateId: template.id,
    diagnostics,
  };
};

export const runStoreDiagnostics = (
  templates: readonly DrillTemplateRecord[],
  runs: readonly DrillRunRecord[],
  tenant: RecoveryDrillTenantId,
): readonly HealthMatrix[] => {
  const filteredTemplates = templates.filter((item) => item.tenantId === tenant);
  const byTemplate = filteredTemplates.map((templateRecord) => diagnoseTemplate(templateRecord.template, runs.filter((run) => run.templateId === templateRecord.templateId)));
  const runQuery: DrillStoreQuery = { tenant: tenant as never, status: ['running', 'queued', 'paused', 'failed', 'succeeded'] };
  void runQuery;
  const rows = summarizeMetricRows(filteredTemplates, runs);
  void rows;
  return byTemplate;
};
