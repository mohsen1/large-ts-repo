import { buildOperationsReport, buildWindowKey, buildSnapshotEnvelope } from '@data/recovery-operations-analytics';
import type { RunAssessment, RunAssessmentSummary, RecoveryRiskSignal } from '@domain/recovery-operations-intelligence';
import { buildFunnel, type FunnelReport } from '@domain/analytics';
import { withBrand } from '@shared/core';

export interface PolicySignalWindow {
  readonly tenant: string;
  readonly runId: string;
  readonly createdAt: string;
  readonly riskSignals: readonly RecoveryRiskSignal[];
  readonly assessments: readonly RunAssessment[];
}

export interface PolicyRule<TContext> {
  readonly id: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly evaluate: (context: TContext) => boolean;
}

export interface PolicyRuleResult {
  readonly ruleId: string;
  readonly passed: boolean;
  readonly score: number;
  readonly evidence: readonly string[];
}

const severityToScore = (severity: PolicyRule<PolicyContext>['severity']): number => {
  if (severity === 'low') return 100;
  if (severity === 'medium') return 70;
  if (severity === 'high') return 30;
  return 0;
};

export interface PolicyRuleBreakdown {
  readonly totalScore: number;
  readonly passedCount: number;
  readonly blockedCount: number;
  readonly rules: readonly PolicyRuleResult[];
}

interface PolicyRuleInput {
  readonly tenant: string;
  readonly runId: string;
  readonly plan: {
    readonly score: number;
    readonly constraints?: {
      readonly maxRetries: number;
      readonly timeoutMinutes: number;
    };
  };
  readonly signals: readonly RecoveryRiskSignal[];
  readonly assessments: readonly RunAssessment[];
}

export interface PolicyContext {
  readonly tenant: string;
  readonly runId: string;
  readonly policyPlanScore: number;
  readonly signalDensity: number;
  readonly signalConfidence: number;
  readonly retryBudget: number;
  readonly timeoutBudgetMinutes: number;
}

const toContext = (input: PolicyRuleInput): PolicyContext => ({
  tenant: input.tenant,
  runId: input.runId,
  policyPlanScore: input.plan.score,
  signalDensity: input.signals.length,
  signalConfidence: input.assessments.length
    ? input.assessments.reduce((acc, assessment) => acc + assessment.confidence, 0) / input.assessments.length
    : 0,
  retryBudget: input.plan.constraints?.maxRetries ?? 0,
  timeoutBudgetMinutes: input.plan.constraints?.timeoutMinutes ?? 0,
});

const defaultRules: readonly PolicyRule<PolicyContext>[] = [
  {
    id: 'policy.score.above-zero',
    severity: 'critical',
    evaluate: (value) => value.policyPlanScore > 0,
  },
  {
    id: 'policy.signal.bound',
    severity: 'medium',
    evaluate: (value) => value.signalDensity < 100,
  },
  {
    id: 'policy.timeout.positive',
    severity: 'low',
    evaluate: (value) => value.timeoutBudgetMinutes > 0,
  },
  {
    id: 'policy.retry.enabled',
    severity: 'high',
    evaluate: (value) => value.retryBudget >= 1,
  },
];

export const evaluatePolicyRules = (
  input: PolicyRuleInput,
  ruleSet: readonly PolicyRule<PolicyContext>[] = defaultRules,
): PolicyRuleBreakdown => {
  const context = toContext(input);
  const rules = ruleSet.map((rule) => {
    const passed = rule.evaluate(context);
    const score = passed ? severityToScore(rule.severity) : 0;
    const evidence = [
      `tenant=${context.tenant}`,
      `runId=${context.runId}`,
      `severity=${rule.severity}`,
      `score=${score}`,
    ];

    return {
      ruleId: rule.id,
      passed,
      score,
      evidence,
    };
  });

  const passedCount = rules.filter((rule) => rule.passed).length;
  const blockedCount = rules.length - passedCount;
  const totalScore = rules.reduce((acc, rule) => acc + rule.score, 0) / Math.max(1, rules.length);
  return {
    totalScore,
    passedCount,
    blockedCount,
    rules,
  };
};

export const buildPolicyMetrics = (
  tenant: string,
  runId: string,
  input: PolicyRuleInput,
): {
  readonly report: FunnelReport;
  readonly fingerprint: string;
  readonly digest: string;
} => {
  const breakdown = evaluatePolicyRules(input);
  const report: FunnelReport = buildFunnel([
    {
      name: 'signals',
      value: input.signals.length,
    },
    {
      name: 'assessments',
      value: input.assessments.length,
    },
    {
      name: 'ruleScore',
      value: breakdown.totalScore,
    },
  ]);

  void buildOperationsReport({
    tenant,
    signals: input.signals.map((signal) => signal.signal),
    sessions: [],
    decisions: [],
    assessments: input.assessments,
  });

  const digest = buildWindowKey(tenant, {
    from: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
    zone: 'UTC',
    kind: 'minute',
  });
  const envelope = buildSnapshotEnvelope(
    tenant,
    `${runId}/policy/fingerprint`,
    {
      runId,
      passed: breakdown.passedCount,
      blocked: breakdown.blockedCount,
      score: breakdown.totalScore,
      tenant,
    },
    {
      from: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
      zone: 'UTC',
      kind: 'minute',
    },
  );

  return {
    report,
    fingerprint: withBrand(String(digest), 'MetricEnvelopeKey'),
    digest: `${envelope.metric}:pass=${breakdown.passedCount}:blocked=${breakdown.blockedCount}`,
  };
};

export const summarizePolicyRules = (breakdown: PolicyRuleBreakdown): string[] =>
  breakdown.rules.map((rule) => `${rule.ruleId}=${rule.passed ? 'pass' : 'block'}:${rule.score}`);
