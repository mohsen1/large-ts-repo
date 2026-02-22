import type { RunAssessmentSummary, RunAssessment, CohortSignalAggregate, BatchReadinessAssessment, PolicyDecisionHint } from './types';
import type { RecoveryRiskSignal } from './types';
import { aggregateByTenantAndRun, buildBatchAssessment, assessSignals } from './evaluator';

export interface InsightConfig {
  readonly tenant: string;
  readonly runId: string;
  readonly baselineScore: number;
  readonly planSignalLimit: number;
}

export interface ScenarioInsight {
  readonly path: string;
  readonly values: readonly string[];
  readonly confidence: number;
  readonly hints: readonly PolicyDecisionHint[];
}

export interface DecisionSeries {
  readonly tenant: string;
  readonly runId: string;
  readonly scenarioIds: readonly string[];
  readonly createdAt: string;
  readonly totalSignals: number;
}

export const buildScenarioInsights = (
  tenant: string,
  runId: string,
  score: number,
  signals: readonly RecoveryRiskSignal[],
): ScenarioInsight[] => {
  const aggregates = aggregateByTenantAndRun(signals);
  const summary = buildBatchAssessment(aggregates);

  const baseline: ScenarioInsight = {
    path: `plan.id`,
    values: [tenant, runId],
    confidence: Math.min(1, Math.max(0, 1 - score / 12)),
    hints: [
      {
        rule: 'baseline-stability',
        confidence: summary.overallRisk === 'red' ? 0.9 : summary.overallRisk === 'amber' ? 0.6 : 0.98,
        reason: `risk=${summary.overallRisk}`,
      },
    ],
  };

  const perRun: ScenarioInsight[] = aggregates.map((aggregate) => ({
    path: `cohort.count`,
    values: [aggregate.runId, aggregate.tenant, `${aggregate.count}`],
    confidence: Number(aggregate.maxConfidence.toFixed(4)),
    hints: [
      {
        rule: 'cohort-density',
        confidence: aggregate.count > 5 ? 0.84 : 0.53,
        reason: `cohort_count=${aggregate.count}`,
      },
    ],
  }));

  return [baseline, ...perRun];
};

export const summarizePlan = (
  summary: Omit<RunAssessment, 'plan'> & { planSummary: RunAssessmentSummary['planSummary'] },
): DecisionSeries => {
  const assessment = assessSignals(summary.runId, summary.tenant, [], summary.riskScore, summary.planSummary);
  const scenarioIds = summary.recommendedActions.map((action, index) => `${action}-${index}`);

  return {
    tenant: summary.tenant,
    runId: String(summary.runId),
    scenarioIds,
    createdAt: assessment.plan.effectiveAt,
    totalSignals: assessment.intensity.signalCount,
  };
};
