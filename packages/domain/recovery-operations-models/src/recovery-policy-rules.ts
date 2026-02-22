import { z } from 'zod';
import { type Brand, withBrand } from '@shared/core';
import type { RankedSignalPortfolios } from './signal-portfolio';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryConstraintBudget } from './types';

export const operationPrioritySchema = z.enum(['critical', 'normal', 'low']);

export type OperationPriority = z.infer<typeof operationPrioritySchema>;

export interface RiskFactor {
  readonly factor: string;
  readonly score: number;
  readonly detail: string;
}

export type RecoveryPolicyId = Brand<string, 'RecoveryPolicyId'>;

export interface RecoveryPolicyConfig {
  readonly id: RecoveryPolicyId;
  readonly tenant: string;
  readonly enforceManualApproval: boolean;
  readonly budget: RecoveryConstraintBudget;
  readonly priorities: readonly OperationPriority[];
  readonly sourceSignals: readonly string[];
  readonly rationale: string;
}

export interface PolicyEvaluation {
  readonly tenant: string;
  readonly policy: RecoveryPolicyConfig;
  readonly factors: readonly RiskFactor[];
  readonly decision: 'allow' | 'requires-approval' | 'throttle';
  readonly confidence: number;
  readonly createdAt: string;
}

export interface RecoveryPolicyContext {
  readonly tenant: string;
  readonly readiness: RecoveryReadinessPlan;
  readonly portfolios: readonly RankedSignalPortfolios[];
  readonly activeSignals: number;
}

const severityToPriority = (severity: number, factorsCount: number): OperationPriority => {
  if (severity > 7 || factorsCount > 2) return 'critical';
  if (severity > 4) return 'normal';
  return 'low';
};

const calculateBudget = (context: RecoveryPolicyContext): RecoveryConstraintBudget => {
  const severityBand = Math.min(10, context.portfolios.reduce((acc, p) => acc + p.averageSeverity, 0));
  const parallelism = context.readiness.riskBand === 'red' ? 2 : context.readiness.riskBand === 'amber' ? 4 : 8;

  return {
    maxParallelism: Math.max(1, Math.min(12, Math.round(parallelism * (1 - severityBand / 20)))),
    maxRetries: Math.max(1, Math.min(10, context.readiness.targets.length + 1)),
    timeoutMinutes: Math.max(15, Math.round(context.readiness.signals.length + severityBand * 5)),
    operatorApprovalRequired: context.readiness.riskBand === 'red' || severityBand > 8,
  };
};

const scoreSignalCoverage = (ports: readonly RankedSignalPortfolios[]): number => {
  if (!ports.length) return 0;
  return Number((ports.reduce((acc, item) => acc + item.averageSeverity * 0.2 + item.averageConfidence, 0) / ports.length).toFixed(4));
};

const computeFactors = (context: RecoveryPolicyContext): readonly RiskFactor[] => {
  const riskSignalDensity = scoreSignalCoverage(context.portfolios);
  const sourceCount = context.portfolios.reduce((acc, portfolio) => acc + portfolio.clusters.length, 0);
  const targetCoverage = context.readiness.targets.length;

  return [
    {
      factor: 'readiness-risk-band',
      score: context.readiness.riskBand === 'red' ? 1 : context.readiness.riskBand === 'amber' ? 0.6 : 0.2,
      detail: `riskBand=${context.readiness.riskBand}`,
    },
    {
      factor: 'signal-density',
      score: Number(Math.min(1, riskSignalDensity / 10).toFixed(4)),
      detail: `coverage=${riskSignalDensity.toFixed(4)}`,
    },
    {
      factor: 'source-entropy',
      score: sourceCount > 0 ? Number((1 / sourceCount).toFixed(4)) : 0,
      detail: `clusters=${sourceCount}`,
    },
    {
      factor: 'target-count',
      score: Number(Math.min(1, targetCoverage / 12).toFixed(4)),
      detail: `targets=${targetCoverage}`,
    },
  ];
};

const decisionFor = (context: RecoveryPolicyContext, priority: OperationPriority): PolicyEvaluation['decision'] => {
  if (priority === 'critical' && context.activeSignals > 35) {
    return 'requires-approval';
  }

  if (priority === 'normal' || context.activeSignals > 20) {
    return 'throttle';
  }

  return 'allow';
};

export const evaluateRecoveryPolicy = (context: RecoveryPolicyContext): PolicyEvaluation => {
  const factors = computeFactors(context);
  const score = factors.reduce((acc, item) => acc + item.score, 0);
  const priority = severityToPriority(score, context.readiness.signals.length);
  const decision = decisionFor(context, priority);
  const budget = calculateBudget(context);
  const signalIds = context.portfolios.flatMap((portfolio) => portfolio.clusters.flatMap((cluster) => cluster.signatures.map((signal) => signal.id)));

  return {
    tenant: context.tenant,
    factors,
    decision,
    confidence: Number(Math.min(1, Math.max(0, score / 4)).toFixed(4)),
    policy: {
      id: withBrand(`${context.tenant}-policy`, 'RecoveryPolicyId'),
      tenant: context.tenant,
      enforceManualApproval: decision === 'requires-approval',
      budget,
      priorities: [priority],
      sourceSignals: signalIds,
      rationale: `tenant=${context.tenant}, riskBand=${context.readiness.riskBand}, signal-score=${score.toFixed(4)}`,
    },
    createdAt: new Date().toISOString(),
  };
};

export const buildPoliciesForTenants = (contexts: readonly RecoveryPolicyContext[]): readonly PolicyEvaluation[] => {
  return contexts.map((context) => evaluateRecoveryPolicy(context));
};

export const policyAllowsAutoRun = (evaluation: PolicyEvaluation): boolean => evaluation.decision === 'allow';
