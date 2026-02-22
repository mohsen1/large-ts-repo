import type { FunnelReport } from '@domain/analytics';
import type {
  BatchReadinessAssessment,
  CohortSignalAggregate,
  RunAssessment,
  IntelligenceSignalSource,
} from '@domain/recovery-operations-intelligence';
import { buildFunnel as createFunnel } from '@domain/analytics';
import { normalizeSignals, type SignalBatch } from './signals';

export interface BatchLineItem {
  readonly tenant: string;
  readonly runId: string;
  readonly key: string;
  readonly value: string;
}

export interface BatchReport {
  readonly tenant: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly funnel: FunnelReport;
  readonly assessments: readonly string[];
  readonly cohorts: readonly { tenant: string; count: number }[];
  readonly signalCount: number;
}

const assessmentDigest = (assessments: readonly RunAssessment[]): readonly string[] =>
  assessments.map((assessment) => `${assessment.runId}:${assessment.riskScore}`);

const countSignals = (batches: readonly SignalBatch[]): number =>
  batches.reduce((acc, batch) => acc + batch.signals.length, 0);

export const buildBatchReport = (
  tenant: string,
  runId: string,
  assessments: readonly RunAssessment[],
  cohorts: readonly CohortSignalAggregate[],
  batches: readonly SignalBatch[],
): BatchReport => {
  const normalized = batches.flatMap((batch) => normalizeSignals(batch));
  const uniqueCount = countSignals(normalized);
  const assessmentCount = assessments.length;
  const cohortCount = cohorts.length;
  const funnel: FunnelReport = createFunnel([
    { name: 'signals', value: uniqueCount },
    { name: 'assessments', value: assessmentCount },
    { name: 'cohorts', value: cohortCount },
  ]);

  const tenantCohort = { tenant, count: cohortCount };

  return {
    tenant,
    runId,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    completedAt: new Date().toISOString(),
    funnel,
    assessments: assessmentDigest(assessments),
    cohorts: [tenantCohort],
    signalCount: uniqueCount,
  };
};

export const renderBatchLine = (report: BatchReport): readonly BatchLineItem[] => {
  const cohortLine = report.cohorts.map((cohort) => ({
    tenant: report.tenant,
    runId: report.runId,
    key: `cohorts.${cohort.tenant}`,
    value: `${cohort.count}`,
  }));
  const scoreLine: BatchLineItem = {
    tenant: report.tenant,
    runId: report.runId,
    key: 'funnel.hitRate',
    value: report.funnel.hitRate.toFixed(4),
  };
  const summaryLine: BatchLineItem = {
    tenant: report.tenant,
    runId: report.runId,
    key: 'summary',
    value: `${report.signalCount} signals`,
  };

  return [...cohortLine, scoreLine, summaryLine];
};

export const buildBatchLines = (report: BatchReport): readonly string[] =>
  renderBatchLine(report).map((line) => `${line.tenant}|${line.runId}|${line.key}=${line.value}`);

export const mergeReports = (left: BatchReport, right: BatchReport): BatchReport => ({
  tenant: left.tenant,
  runId: left.runId,
  startedAt: left.startedAt,
  completedAt: right.completedAt,
  funnel: {
    funnel: `${left.funnel.funnel}|${right.funnel.funnel}`,
    hitRate: (left.funnel.hitRate + right.funnel.hitRate) / 2,
    dropoffs: [...left.funnel.dropoffs, ...right.funnel.dropoffs],
  },
  assessments: [...left.assessments, ...right.assessments],
  cohorts: [...left.cohorts, ...right.cohorts],
  signalCount: left.signalCount + right.signalCount,
});

export const toCompactBatch = (report: BatchReport): BatchReadinessAssessment => ({
  cohort: report.cohorts.map((cohort) => ({
    tenant: report.tenant as CohortSignalAggregate['tenant'],
    runId: report.runId as CohortSignalAggregate['runId'],
    count: cohort.count,
    maxConfidence: report.signalCount > 0 ? 1 : 0,
    distinctSources: ['telemetry'] as readonly IntelligenceSignalSource[],
  })),
  generatedAt: report.completedAt,
  overallRisk: report.funnel.hitRate > 0.66 ? 'green' : report.funnel.hitRate > 0.33 ? 'amber' : 'red',
});
