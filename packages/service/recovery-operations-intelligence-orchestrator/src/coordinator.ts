import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import {
  aggregateByTenantAndRun,
  assessSignals,
  buildBatchAssessment,
  buildBatchFromSignals,
  buildScenarioInsights,
  type CohortSignalAggregate,
  type RecoveryRiskSignal,
  type RunAssessment,
  type IntelligenceSignalSource,
} from '@domain/recovery-operations-intelligence';
import { parseRawSignals } from './signals';
import { buildBatchLines, buildBatchReport } from './batch-reporter';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';

export interface RuntimeCoordinatorInput {
  readonly tenant: string;
  readonly runId: string;
  readonly signals: readonly unknown[];
}

export interface RuntimeCoordinatorOutput {
  readonly tenant: string;
  readonly runId: string;
  readonly batchRisk: 'green' | 'amber' | 'red';
  readonly summaries: readonly string[];
  readonly reportLines: readonly string[];
}

type ParsedSignals = ReturnType<typeof parseRawSignals>;

const riskSignalsFor = (input: RuntimeCoordinatorInput): {
  readonly batches: ParsedSignals;
  readonly signals: readonly RecoveryRiskSignal[];
} => {
  const batches = parseRawSignals(input.signals);
  const signals = batches.flatMap((batch) => batch.signals);
  return { batches, signals };
};

const buildAssessments = (tenant: string, signals: readonly RecoveryRiskSignal[]): readonly RunAssessment[] => {
  if (!signals.length) {
    return [];
  }

  return signals.map((signal, index) =>
    assessSignals(
      signal.runId,
      tenant,
      [signal.signal],
      signal.signal.severity + index,
      {
        planId: withBrand(`${tenant}-baseline`, 'RunPlanId'),
        signalBudget: {
          maxRetries: 3,
          timeoutMinutes: 20,
        },
      },
    ),
  );
};

const toCohorts = (assessments: readonly RunAssessment[]): readonly CohortSignalAggregate[] =>
  assessments.map((assessment) => ({
    tenant: withBrand(assessment.tenant, 'TenantId'),
    runId: assessment.runId,
    count: 1,
    maxConfidence: assessment.confidence,
    distinctSources: ['policy'] as readonly IntelligenceSignalSource[],
  }));

export const coordinateRunGroups = async (
  inputs: readonly RuntimeCoordinatorInput[],
  repositories: {
    operations: RecoveryOperationsRepository;
    intelligence: IntelligenceRepository;
  },
): Promise<Result<RuntimeCoordinatorOutput, string>> => {
  if (inputs.length === 0) {
    return fail('EMPTY_COORDINATOR_INPUT');
  }

  const first = inputs[0];
  if (!first) {
    return fail('NO_COORDINATOR_INPUT');
  }

  const parsed = riskSignalsFor(first);
  if (!parsed.signals.length) {
    return fail('COORDINATOR_NO_SIGNALS');
  }

  const assessments = buildAssessments(first.tenant, parsed.signals);
  const cohorts = toCohorts(assessments);
  const batch = buildBatchAssessment(aggregateByTenantAndRun(parsed.signals));
  const bucketed = buildBatchFromSignals(parsed.signals);
  const insights = buildScenarioInsights(
    first.tenant,
    first.runId,
    bucketed.overallRisk === 'red' ? 0 : 4,
    parsed.signals,
  );

  await repositories.intelligence.saveBatchAssessment(withBrand(first.tenant, 'TenantId'), batch);

  const report = buildBatchReport(first.tenant, first.runId, assessments, cohorts, parsed.batches);
  const reportLines = [...buildBatchLines(report), ...insights.map((insight) => `${insight.path}:${insight.confidence}`)];

  if (batch.overallRisk === 'red') {
    return fail(`COORDINATOR_RISK_${batch.overallRisk}`);
  }

  return ok({
    tenant: first.tenant,
    runId: first.runId,
    batchRisk: batch.overallRisk,
    summaries: bucketed.cohort.map((entry) => `${entry.runId}:${entry.count}`),
    reportLines,
  });
};
