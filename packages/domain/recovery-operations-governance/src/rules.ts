import { withBrand } from '@shared/core';
import type { PolicyConstraint, PolicyFinding, PolicyMetadata, PolicyRule, PolicyScope, PolicySeverity } from './types';

const HIGH_SEVERITY_KEYS = ['database', 'network', 'compliance', 'safety'];
const MIN_ALLOWED_PARALLELISM = 1;

export const createSystemRule = (
  id: string,
  scope: PolicyScope,
  key: string,
  value: PolicyRule['constraint']['value'],
  severity: PolicySeverity = 'warn',
): PolicyRule => ({
  id,
  active: true,
  priority: 'high',
  severity,
  reason: `system rule for ${key}`,
  constraint: { scope, key, value, threshold: typeof value === 'number' ? value : undefined },
  tags: ['system', 'recovery-operations'],
});

export const buildPolicyMetadata = (policyId: string): PolicyMetadata => ({
  policyId,
  policyName: `Policy ${policyId}`,
  ownerTeam: 'recovery-ops',
  updatedAt: new Date().toISOString(),
  version: '2026.01.01',
});

export const evaluateConstraintMatch = <TScope extends PolicyScope>(
  constraint: PolicyConstraint<TScope>,
  context: { tenant: string; targetTags: readonly string[]; severityHint: number },
): PolicyFinding<TScope> => {
  const shouldMatchByScope =
    constraint.scope === 'fleet' || context.targetTags.includes(constraint.key) || constraint.key === 'tenant';

  const numericSeverity = typeof constraint.value === 'number'
    ? constraint.value
    : context.severityHint;
  const hasCapacityIssue = constraint.threshold !== undefined && numericSeverity > constraint.threshold;
  const isHighPriority = HIGH_SEVERITY_KEYS.some((entry) => constraint.key.includes(entry));

  const matched = shouldMatchByScope && (typeof constraint.value === 'boolean'
    ? constraint.value
    : hasCapacityIssue || context.severityHint > 0.85 || isHighPriority);

  const ruleId = withBrand(`${constraint.scope}:${constraint.key}`, 'PolicyRuleId');

  return {
    ruleId,
    scope: constraint.scope,
    severity: hasCapacityIssue ? 'block' : isHighPriority ? 'warn' : 'allow',
    matched,
    message: matched
      ? `Constraint ${constraint.key} indicates policy action`
      : `Constraint ${constraint.key} passed`,
    details: {
      scope: constraint.scope,
      expected: constraint.value,
      threshold: constraint.threshold ?? MIN_ALLOWED_PARALLELISM,
      targetTags: [...context.targetTags],
    },
  };
};

export const buildStandardRules = (tenant: string): readonly PolicyRule[] => [
  {
    ...createSystemRule('OPS-101', 'session', 'tenant', tenant),
    priority: 'critical',
    reason: `Tenant ${tenant} must be explicitly configured for operations run`,
    tags: ['tenant-boundary'],
  },
  createSystemRule('OPS-102', 'plan', 'maxRetries', 6, 'block'),
  createSystemRule('OPS-103', 'fleet', 'compliance-mode', true, 'warn'),
  createSystemRule('OPS-104', 'session', 'operatorApprovalRequired', true, 'warn'),
];
