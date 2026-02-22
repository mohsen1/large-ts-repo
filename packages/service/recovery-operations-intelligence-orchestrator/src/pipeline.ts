import { withBrand } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';
import {
  assessSignals,
  buildBatchAssessment,
  aggregateByTenantAndRun,
  parseAndNormalizeAssessment,
} from '@domain/recovery-operations-intelligence';
import type {
  IntelligenceRunId,
  RecoveryRiskSignal,
  RunAssessment,
} from '@domain/recovery-operations-intelligence';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { buildScenarioInsights } from '@domain/recovery-operations-intelligence';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';

interface PipelineInput {
  readonly tenant: string;
  readonly runId: IntelligenceRunId;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoveryRiskSignal[];
}

const maxSignalWeight = 9;

const scoreSignals = (signals: readonly RecoveryRiskSignal[]): number => {
  if (!signals.length) {
    return 0;
  }

  const score = signals.reduce((total, item) => {
    const weighted = item.signal.severity * (item.signal.confidence || 1);
    return total + weighted;
  }, 0);

  return Number((score / signals.length).toFixed(4));
};

export interface PipelineOutput {
  readonly tenant: string;
  readonly runId: string;
  readonly score: number;
  readonly assessments: readonly RunAssessment[];
  readonly batchRisk: 'green' | 'amber' | 'red';
}

export const runIntelligencePipeline = async (
  input: PipelineInput,
  repositories: {
    operations: RecoveryOperationsRepository;
    intelligence: IntelligenceRepository;
  },
): Promise<Result<PipelineOutput, string>> => {
  const parsedSignals = input.signals.map((signal) => ({ ...signal, runId: input.runId, signal: signal.signal }));
  const score = scoreSignals(parsedSignals);

  const aggregate = aggregateByTenantAndRun(parsedSignals);
  const batch = buildBatchAssessment(aggregate);
  const readinessPlanScore = Math.max(0, Math.min(1, input.readinessPlan.targets.length / maxSignalWeight));

  const assessments: RunAssessment[] = parsedSignals.map((entry, index) => {
    const assessment = assessSignals(
      entry.runId,
      input.tenant,
      [entry.signal],
      score + readinessPlanScore * (index + 1),
      {
        planId: withBrand(`${input.tenant}-run`, 'RunPlanId'),
        signalBudget: {
          maxRetries: 3,
          timeoutMinutes: 30,
        },
      },
    );

    await repositories.intelligence.saveSnapshot({
      tenant: withBrand(input.tenant, 'TenantId'),
      runId: entry.runId,
      sourceRunId: entry.runId,
      assessment,
      points: [],
      recordedAt: new Date().toISOString(),
    });

    const normalized = parseAndNormalizeAssessment(assessment);
    return normalized;
  });

  for (const signal of parsedSignals) {
    await repositories.intelligence.logSignal({
      tenant: withBrand(signal.window.tenant, 'TenantId'),
      runId: signal.runId,
      signal: signal.signal,
      score,
      consumedAt: signal.window.to,
    });
  }

  const first = assessments[0]?.runId;
  if (!first) {
    return fail('EMPTY_PIPELINE');
  }

  const insights = buildScenarioInsights(input.tenant, String(first), score, parsedSignals);
  if (!insights.length) {
    return fail('EMPTY_INSIGHTS');
  }

  const batchRisk = batch.overallRisk;
  return ok({
    tenant: input.tenant,
    runId: String(input.runId),
    score,
    assessments,
    batchRisk,
  });
};
