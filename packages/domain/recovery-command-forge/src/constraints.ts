import type { Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type { ForgeBudgetEnvelope, ForgeScenario, ForgePolicyResult, ForgeTopology, ForgeExecutionReport } from './types';

export type ForgeConstraintId = Brand<string, 'RecoveryForgeConstraintId'>;

export interface ConstraintViolation {
  readonly constraint: ForgeConstraintId;
  readonly key: string;
  readonly detail: string;
  readonly impact: 'low' | 'medium' | 'high';
}

export interface ConstraintSet {
  readonly constraints: readonly ConstraintRule[];
  readonly criticalThreshold: number;
  readonly policyThreshold: number;
}

export interface ConstraintRule {
  readonly id: ForgeConstraintId;
  readonly name: string;
  readonly enabled: boolean;
  readonly evaluate: (scenario: ForgeScenario, budget: ForgeBudgetEnvelope) => ConstraintViolation[];
}

export interface ConstraintReport {
  readonly scenarioCount: number;
  readonly violationCount: number;
  readonly criticalCount: number;
  readonly warnings: readonly ConstraintViolation[];
  readonly ok: boolean;
}

export const constraintViolation = (
  key: string,
  detail: string,
  impact: ConstraintViolation['impact'],
): ConstraintViolation => ({
  constraint: withBrand(`constraint:${key}`, 'RecoveryForgeConstraintId'),
  key,
  detail,
  impact,
});

export const buildBudgetConstraint = (maxDurationMinutes = 420, minDurationMinutes = 30): ConstraintRule => ({
  id: withBrand(`budget:max-duration`, 'RecoveryForgeConstraintId'),
  name: 'max-duration-budget',
  enabled: true,
  evaluate: (_scenario, budget) => {
    const violations: ConstraintViolation[] = [];
    if (budget.maxDurationMinutes > maxDurationMinutes) {
      violations.push(constraintViolation('duration-over', `maxDurationMinutes=${budget.maxDurationMinutes}`, 'high'));
    }
    if (budget.maxDurationMinutes < minDurationMinutes) {
      violations.push(constraintViolation('duration-under', `maxDurationMinutes=${budget.maxDurationMinutes}`, 'medium'));
    }
    return violations;
  },
});

export const buildParallelismConstraint = (maxParallelism = 20, minParallelism = 1): ConstraintRule => ({
  id: withBrand('parallelism:balance', 'RecoveryForgeConstraintId'),
  name: 'parallelism-bounds',
  enabled: true,
  evaluate: (_scenario, budget) => {
    const violations: ConstraintViolation[] = [];
    if (budget.parallelismLimit > maxParallelism) {
      violations.push(constraintViolation('parallelism-over', `parallelism=${budget.parallelismLimit}`, 'high'));
    }
    if (budget.parallelismLimit < minParallelism) {
      violations.push(constraintViolation('parallelism-under', `parallelism=${budget.parallelismLimit}`, 'low'));
    }
    return violations;
  },
});

export const buildRetryConstraint = (maxRetry = 8): ConstraintRule => ({
  id: withBrand('retry:pressure', 'RecoveryForgeConstraintId'),
  name: 'retry-pressure',
  enabled: true,
  evaluate: (_scenario, budget) => {
    return budget.retryLimit > maxRetry
      ? [constraintViolation('retry-over', `retry=${budget.retryLimit}`, 'medium')]
      : [];
  },
});

export const defaultConstraintSet = (criticalThreshold = 2, policyThreshold = 0.5): ConstraintSet => ({
  constraints: [
    buildBudgetConstraint(),
    buildParallelismConstraint(),
    buildRetryConstraint(),
  ],
  criticalThreshold,
  policyThreshold,
});

export const evaluateConstraintSet = (
  set: ConstraintSet,
  scenario: ForgeScenario,
  budget: ForgeBudgetEnvelope,
): ConstraintReport => {
  const warnings = set.constraints
    .filter((rule) => rule.enabled)
    .flatMap((rule) => rule.evaluate(scenario, budget));

  const criticalCount = warnings.filter((item) => item.impact === 'high').length;
  const warningCount = warnings.length;

  return {
    scenarioCount: 1,
    violationCount: warningCount,
    criticalCount,
    warnings,
    ok: criticalCount <= set.criticalThreshold && warningCount <= set.policyThreshold * 100,
  };
};

export const evaluatePolicyConstraint = (
  set: ConstraintSet,
  policy: ForgePolicyResult,
): ConstraintViolation[] => {
  const missingPass = !policy.pass;
  if (!missingPass) {
    return [];
  }

  return [
    constraintViolation(
      'policy-failed',
      `policy=${policy.summary} risk=${policy.riskScore}`,
      policy.riskScore > 80 ? 'high' : 'medium',
    ),
  ];
};

export const aggregateConstraintSeverity = (entries: readonly ConstraintViolation[]): number => {
  const severity = entries.reduce((acc, item) => {
    if (item.impact === 'high') {
      return acc + 10;
    }
    if (item.impact === 'medium') {
      return acc + 5;
    }
    return acc + 1;
  }, 0);

  return severity;
};

export const summarizeTopologiesForConstraint = (topologies: readonly ForgeTopology[]): string => {
  const summary = topologies
    .map((topology) => `${topology.wave}:${topology.nodes.length}`)
    .join(',');
  return summary.length > 0 ? summary : 'none';
};

export const evaluateReportConstraints = (set: ConstraintSet, report: ForgeExecutionReport): ConstraintReport => {
  const policyWarnings = evaluatePolicyConstraint(set, report.policy);
  const criticalCount = policyWarnings.filter((item) => item.impact === 'high').length;
  return {
    scenarioCount: report.topologies.length,
    violationCount: policyWarnings.length + report.topologies.length,
    criticalCount,
    warnings: [
      ...policyWarnings,
      ...report.topologies.map((topology) =>
        constraintViolation('topology-wave', `${topology.wave} has ${topology.nodes.length} nodes`, topology.nodes.length > 20 ? 'high' : 'low'),
      ),
    ],
    ok: criticalCount === 0,
  };
};
