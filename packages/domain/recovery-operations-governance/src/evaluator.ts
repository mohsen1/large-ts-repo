import { withBrand } from '@shared/core';
import type {
  PolicyContext,
  PolicyEvaluationAggregate,
  PolicyEvaluationOutcome,
  PolicyFinding,
  PolicyMetadata,
} from './types';
import { buildStandardRules, evaluateConstraintMatch } from './rules';

const MAX_ALLOWABLE_SCORE = 8;

const summarizeFindings = (
  tenant: string,
  contextRunId: string,
  findings: readonly PolicyFinding[],
): PolicyEvaluationAggregate => {
  const riskBand = findings.some((finding) => finding.severity === 'block')
    ? 'red'
    : findings.some((finding) => finding.severity === 'warn')
      ? 'amber'
      : 'green';

  const severityByScope = findings.reduce(
    (acc, finding) => {
      const severityScore = finding.severity === 'block' ? 3 : finding.severity === 'warn' ? 1 : 0;
      acc[finding.scope] = (acc[finding.scope] ?? 0) + severityScore;
      return acc;
    },
    { session: 0, plan: 0, fleet: 0 } as Record<string, number>,
  );

  const score = findings.reduce(
    (acc, finding) =>
      acc + (finding.matched ? (finding.severity === 'block' ? 3 : 1) : -0.2),
    0,
  );

  return {
    runId: withBrand(`${tenant}-${contextRunId}`, 'RecoveryRunId'),
    assessedAt: new Date().toISOString(),
    blocked: riskBand === 'red',
    riskBand,
    severityByScope: severityByScope as PolicyEvaluationAggregate['severityByScope'],
  };
};

const calculateConfidence = (findings: readonly PolicyFinding[]): number => {
  const matchedCount = findings.filter((item) => item.matched).length;
  const warnRatio = findings.length ? matchedCount / findings.length : 0;
  return Number((1 - Math.min(1, warnRatio)).toFixed(4));
};

const buildMetadata = (tenant: string): PolicyMetadata => ({
  policyId: `GORV-${tenant.toUpperCase()}`,
  policyName: 'Governance baseline',
  ownerTeam: 'recovery-ops',
  updatedAt: new Date().toISOString(),
  version: 'r2026-01',
});

export const evaluateRecoveryPolicy = (context: PolicyContext): PolicyEvaluationOutcome => {
  const standardRules = buildStandardRules(context.fingerprint.tenant);
  const targetTags = context.readinessPlan.targets.flatMap((target) => [target.ownerTeam, target.name, target.criticality]);
  const signalDensity = Math.max(0, Math.min(1, context.signals.length / 20));

  const findings: PolicyFinding[] = standardRules.map((rule) => {
    const constraintResult = evaluateConstraintMatch(rule.constraint, {
      tenant: context.fingerprint.tenant,
      targetTags,
      severityHint: signalDensity + context.program.priority / 10,
    });

    return {
      ruleId: `${context.fingerprint.tenant}-${rule.id}`,
      ...constraintResult,
      scope: rule.constraint.scope,
    } as PolicyFinding;
  });

  const runId = `${context.fingerprint.tenant}-${context.program.id}`;
  const aggregate = summarizeFindings(context.fingerprint.tenant, runId, findings);
  const confidence = calculateConfidence(findings);
  const score = Number((confidence * MAX_ALLOWABLE_SCORE).toFixed(4));

  return {
    tenant: context.fingerprint.tenant,
    runId: aggregate.runId,
    assessedAt: aggregate.assessedAt,
    metadata: buildMetadata(context.fingerprint.tenant),
    signalsCount: context.signals.length,
    findings,
    score,
    blocked: aggregate.blocked || score < 2,
  };
};
