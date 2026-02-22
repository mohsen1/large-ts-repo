import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import type { RecoverySignal, RecoveryConstraintBudget, IncidentFingerprint } from './types';

export type QualityDimension = 'safety' | 'reliability' | 'compliance' | 'readiness';
export type QualityThreshold = 'pass' | 'warn' | 'fail';
export type QualityRuleId = Brand<string, 'QualityRuleId'>;
export type QualityRuleSetId = Brand<string, 'QualityRuleSetId'>;

export interface QualityRule<TContext = unknown> {
  readonly id: QualityRuleId;
  readonly dimension: QualityDimension;
  readonly enabled: boolean;
  readonly weight: number;
  readonly evaluate: (context: TContext) => QualityThreshold;
}

export interface QualityCheckResult {
  readonly ruleId: QualityRuleId;
  readonly ruleDimension: QualityDimension;
  readonly status: QualityThreshold;
  readonly reasons: readonly string[];
  readonly weight: number;
}

export interface CohortSignalAggregate {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runId: Brand<string, 'IntelligenceRunId'>;
  readonly count: number;
  readonly maxConfidence: number;
  readonly distinctSources: readonly string[];
}

export interface RunAssessment {
  readonly runId: Brand<string, 'IntelligenceRunId'>;
  readonly tenant: string;
  readonly riskScore: number;
  readonly confidence: number;
}

export interface BatchReadinessAssessment {
  readonly cohort: readonly CohortSignalAggregate[];
  readonly generatedAt: string;
  readonly overallRisk: 'green' | 'amber' | 'red';
}

export interface QualityResult {
  readonly ruleSetId: QualityRuleSetId;
  readonly runId: string;
  readonly tenant: string;
  readonly checks: readonly QualityCheckResult[];
  readonly overall: QualityThreshold;
  readonly score: number;
  readonly assessedAt: string;
}

export interface RulePlanContext {
  readonly tenant: string;
  readonly signature: string;
  readonly severity: number;
  readonly freshnessMinutes: number;
  readonly riskSignals: readonly RecoverySignal[];
  readonly cohorts: readonly CohortSignalAggregate[];
  readonly batch: BatchReadinessAssessment;
}

const toRuleId = (value: string): QualityRuleId => withBrand(value, 'QualityRuleId');
const toRuleSetId = (value: string): QualityRuleSetId => withBrand(value, 'QualityRuleSetId');

const toThreshold = (score: number): QualityThreshold => {
  if (score >= 0.8) return 'pass';
  if (score >= 0.5) return 'warn';
  return 'fail';
};

const buildReasons = (label: string, score: number): readonly string[] => {
  if (score >= 0.8) return [label, 'stable'];
  if (score >= 0.5) return [label, 'watch'];
  return [label, 'action-required'];
};

export const defaultQualityRules = (tenant: string): readonly QualityRule<RulePlanContext>[] => [
  {
    id: toRuleId(`${tenant}.safety`),
    dimension: 'safety',
    enabled: true,
    weight: 0.35,
    evaluate: (payload) => toThreshold(payload.freshnessMinutes <= 15 ? 0.9 : 0.65),
  },
  {
    id: toRuleId(`${tenant}.reliability`),
    dimension: 'reliability',
    enabled: true,
    weight: 0.25,
    evaluate: (payload) =>
      toThreshold(payload.riskSignals.length >= 3 && payload.riskSignals.every((signal) => signal.confidence >= 0.5) ? 0.85 : 0.4),
  },
  {
    id: toRuleId(`${tenant}.compliance`),
    dimension: 'compliance',
    enabled: true,
    weight: 0.2,
    evaluate: (payload) => toThreshold(payload.batch.overallRisk === 'green' ? 1 : payload.batch.overallRisk === 'amber' ? 0.7 : 0.45),
  },
  {
    id: toRuleId(`${tenant}.readiness`),
    dimension: 'readiness',
    enabled: true,
    weight: 0.2,
    evaluate: (payload) => {
      const riskPressure = payload.cohorts.reduce((acc, entry) => acc + entry.count, 0);
      return toThreshold(Math.min(1, Math.max(0, 1 - riskPressure / 20)));
    },
  },
];

export const evaluateQualityRules = (
  tenant: string,
  runId: string,
  context: RulePlanContext,
): QualityResult => {
  const checks: QualityCheckResult[] = defaultQualityRules(tenant)
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const status = rule.evaluate(context);
      return {
        ruleId: rule.id,
        ruleDimension: rule.dimension,
        status,
        reasons: buildReasons(rule.dimension, status === 'pass' ? 1 : status === 'warn' ? 0.6 : 0.2),
        weight: rule.weight,
      };
    });

  const weights = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = weights
    ? checks.reduce((sum, check) => {
        const point = check.status === 'pass' ? 1 : check.status === 'warn' ? 0.6 : 0.2;
        return sum + point * (check.weight / weights);
      }, 0)
    : 0;

  return {
    ruleSetId: toRuleSetId(`${tenant}-${runId}-ruleset`),
    runId,
    tenant,
    checks,
    overall: toThreshold(score),
    score: Number(score.toFixed(4)),
    assessedAt: new Date().toISOString(),
  };
};

export const estimateQuality = (
  tenant: string,
  runId: string,
  assessments: readonly RunAssessment[],
  cohorts: readonly CohortSignalAggregate[],
  batch: BatchReadinessAssessment,
): QualityResult => {
  const riskSignals = assessments.map<RecoverySignal>((entry) => ({
    id: `${entry.tenant}-${entry.runId}`,
    source: entry.tenant,
    severity: Math.max(1, Math.min(10, Math.round(entry.riskScore || 1))),
    confidence: entry.confidence,
    detectedAt: new Date().toISOString(),
    details: {
      runId: String(entry.runId),
      tenant,
      assessedAt: new Date().toISOString(),
      score: entry.riskScore,
    },
  }));

  const context: RulePlanContext = {
    tenant,
    signature: `${tenant}-${runId}`,
    severity: riskSignals.reduce((sum, signal) => sum + signal.severity, 0),
    freshnessMinutes: 5,
    riskSignals,
    cohorts,
    batch,
  };

  return evaluateQualityRules(tenant, runId, context);
};

export const requiresEscalation = (result: QualityResult): boolean =>
  result.overall === 'fail' || result.score < 0.45;

export const normalizeBudget = (budget: RecoveryConstraintBudget): RecoveryConstraintBudget => ({
  maxParallelism: Math.max(1, Math.min(64, budget.maxParallelism)),
  maxRetries: Math.max(0, Math.min(12, budget.maxRetries)),
  timeoutMinutes: Math.max(1, Math.min(24 * 60, budget.timeoutMinutes)),
  operatorApprovalRequired: budget.operatorApprovalRequired,
});

export const estimateBudgetRisk = (fingerprint: IncidentFingerprint, budget: RecoveryConstraintBudget): 'low' | 'medium' | 'high' => {
  const normalizedParallel = Math.min(1, budget.maxParallelism / 16);
  const normalizedRetries = Math.min(1, budget.maxRetries / 10);
  const normalizedTimeout = Math.min(1, budget.timeoutMinutes / (fingerprint.estimatedRecoveryMinutes * 2));
  const score = normalizedParallel * 0.4 + normalizedRetries * 0.3 + normalizedTimeout * 0.3;

  if (score < 0.33) return 'low';
  if (score < 0.66) return 'medium';
  return 'high';
};

export const buildQualitySummary = (results: readonly QualityResult[]): string => {
  const top = results[0];
  if (!top) return 'no-quality';

  const counts = results.reduce(
    (acc, item) => {
      acc[item.overall]++;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  return [
    `tenant:${top.tenant}`,
    `run:${top.runId}`,
    `checks:${top.checks.length}`,
    `score:${top.score.toFixed(3)}`,
    `pass:${counts.pass}`,
    `warn:${counts.warn}`,
    `fail:${counts.fail}`,
  ].join('|');
};
