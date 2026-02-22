import type { FusionBundle, FusionPlanResult } from '@domain/recovery-fusion-intelligence';
import { buildBundleSnapshot, type FusionTelemetrySnapshot } from '@domain/recovery-fusion-intelligence';
import type { FusionMetrics, FusionCycleResult } from './types';

export interface WorkflowReportRow {
  readonly planId: string;
  readonly runId: string;
  readonly accepted: boolean;
  readonly riskBand: string;
  readonly latencyP50: number;
  readonly latencyP90: number;
  readonly commandCount: number;
  readonly evaluationCount: number;
  readonly recommendationCount: number;
  readonly recommendationTop: string;
  readonly emitted: string;
}

export interface WorkflowReport {
  readonly createdAt: string;
  readonly rows: readonly WorkflowReportRow[];
}

const recommendationTop = (bundle: FusionBundle, snapshot: FusionTelemetrySnapshot): string => {
  const signalCount = bundle.signals.length;
  const metricCount = snapshot.metrics.length;
  return `bundle=${bundle.id}:signals=${signalCount}:metrics=${metricCount}`;
};

export const buildWorkflowReport = (
  cycle: FusionCycleResult,
  bundle: FusionBundle,
  planResult: FusionPlanResult,
  metrics: FusionMetrics,
): WorkflowReport => {
  const snapshot = buildBundleSnapshot(bundle, planResult);
  const rows: WorkflowReportRow[] = [
    {
      planId: cycle.planId,
      runId: cycle.runId,
      accepted: cycle.accepted,
      riskBand: planResult.riskBand,
      latencyP50: metrics.latencyP50,
      latencyP90: metrics.latencyP90,
      commandCount: metrics.commandCount,
      evaluationCount: metrics.evaluationCount,
      recommendationCount: cycle.evaluations.length,
      recommendationTop: recommendationTop(bundle, snapshot),
      emitted: JSON.stringify(snapshot),
    },
  ];

  return {
    createdAt: new Date().toISOString(),
    rows,
  };
};

export const renderWorkflowReport = (report: WorkflowReport): string =>
  report.rows
    .map((row) => `${row.planId}|${row.runId}|${row.accepted ? 'ok' : 'no'}|${row.recommendationTop}`)
    .join('\n');
