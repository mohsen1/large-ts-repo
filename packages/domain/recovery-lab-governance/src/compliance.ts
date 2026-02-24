import { Brand, normalizeLimit, withBrand } from '@shared/core';
import { ComplianceClause, GovernanceTenantId, PolicyProfile, SeverityBand } from './types';

export interface ComplianceCheck {
  readonly tenantId: GovernanceTenantId;
  readonly policyId: Brand<string, 'PolicyId'>;
  readonly clauseId: ComplianceClause['id'];
  readonly severity: SeverityBand;
  readonly satisfied: boolean;
  readonly score: number;
  readonly findings: readonly string[];
}

export interface ComplianceBatch {
  readonly tenantId: GovernanceTenantId;
  readonly profile: PolicyProfile;
  readonly checks: readonly ComplianceCheck[];
  readonly passed: number;
  readonly failed: number;
  readonly averageScore: number;
}

const computeScore = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  return Math.min(100, value);
};

const complianceClauseSatisfied = (clause: ComplianceClause, signals: readonly number[]): boolean => {
  const hasCriticalSignal = signals.some((value) => value > clause.maxRtoMinutes);
  const hasAuditRisk = signals.some((value) => value > clause.maxRpoMinutes);
  return !hasCriticalSignal && !hasAuditRisk;
};

export const evaluateCompliance = (
  tenantId: GovernanceTenantId,
  profile: PolicyProfile,
  clauses: readonly ComplianceClause[],
  signalsByName: Record<string, readonly number[]>,
): ComplianceBatch => {
  const checks: ComplianceCheck[] = [];

  for (const clause of clauses) {
    const observed = signalsByName[clause.title] ?? [];
    const satisfied = complianceClauseSatisfied(clause, observed);
    const severityPenalty = clause.requiresEncryption ? 0 : 5;
    const score = satisfied
      ? 100 - severityPenalty
      : computeScore(100 - normalizeLimit(observed.length) * 0.5 - severityPenalty);
    const findings = clause.requiresEncryption
      ? observed.length > 0
        ? ['encryption requirement active']
        : []
      : ['rto/rpo tracked'];

    checks.push({
      tenantId,
      policyId: profile.policyId,
      clauseId: clause.id,
      severity: profile.maxCriticality <= 3 ? 'low' : profile.maxCriticality <= 4 ? 'medium' : 'critical',
      satisfied,
      score,
      findings,
    });
  }

  const passed = checks.filter((check) => check.satisfied).length;
  const failed = checks.length - passed;
  const total = checks.reduce((sum, check) => sum + check.score, 0);
  const averageScore = checks.length > 0 ? computeScore(total / checks.length) : 0;

  return {
    tenantId,
    profile,
    checks,
    passed,
    failed,
    averageScore,
  };
};

export const createComplianceEnvelope = (tenantId: GovernanceTenantId): ComplianceClause => ({
  id: withBrand(`${tenantId}:default-compliance`, 'ComplianceId'),
  tenantId,
  region: 'global',
  title: 'DR posture and audit baseline',
  description: 'Recovery lab operations should maintain minimal restoration and recovery guarantees',
  requiresEncryption: true,
  maxRtoMinutes: 30,
  maxRpoMinutes: 60,
  lastAuditAt: new Date().toISOString(),
});

export const complianceTrend = (history: readonly ComplianceBatch[]): readonly { readonly at: string; readonly score: number }[] => {
  return history
    .slice()
    .sort((left, right) => left.tenantId.localeCompare(right.tenantId))
    .map((entry, index) => ({
      at: String(index),
      score: entry.averageScore,
    }));
};

export const complianceHealth = (batch: ComplianceBatch): 'pass' | 'warn' | 'fail' => {
  if (batch.averageScore >= 90 && batch.failed === 0) {
    return 'pass';
  }
  if (batch.averageScore >= 70 && batch.failed < batch.checks.length / 2) {
    return 'warn';
  }
  return 'fail';
};
