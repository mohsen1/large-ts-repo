import { withBrand, type Brand } from '@shared/core';

import type { ContinuityPolicy, ContinuityPolicyResult, ContinuitySignal, ContinuityTenantId, ContinuityPolicyViolation } from './types';

export interface PolicyDraft {
  readonly tenantId: ContinuityTenantId;
  readonly name: string;
  readonly minimumSeverity: number;
  readonly criticalityThreshold: number;
  readonly allowAutoMitigation: boolean;
  readonly maxConcurrency: number;
}

const clampSeverity = (value: number): number => Math.max(0, Math.min(100, value));

export const buildPolicy = (draft: PolicyDraft): ContinuityPolicy => ({
  id: withBrand(`${draft.tenantId}:${draft.name}`, 'ContinuityPolicyId'),
  tenantId: draft.tenantId,
  name: draft.name,
  criticalityThreshold: clampSeverity(draft.criticalityThreshold),
  minimumSeverity: clampSeverity(draft.minimumSeverity),
  allowAutoMitigation: draft.allowAutoMitigation,
  maxConcurrency: Math.max(1, Math.round(draft.maxConcurrency)),
});

export const matchesPolicySignals = (signals: readonly ContinuitySignal[], policy: ContinuityPolicy): readonly ContinuitySignal[] =>
  signals.filter((signal) =>
    signal.severity >= policy.minimumSeverity &&
    signal.tenantId === policy.tenantId &&
    !signal.state.startsWith('res'),
  );

const riskToScore = (risk: ContinuitySignal['risk']): number => {
  switch (risk) {
    case 'critical':
      return 1;
    case 'high':
      return 0.75;
    case 'medium':
      return 0.45;
    case 'low':
      return 0.15;
    default:
      return 0;
  }
};

export const evaluatePolicy = (tenantId: ContinuityTenantId, signal: ContinuitySignal, policy: ContinuityPolicy): ContinuityPolicyViolation | undefined => {
  if (signal.tenantId !== tenantId || signal.tenantId !== policy.tenantId) return undefined;
  if (signal.severity < policy.minimumSeverity) return undefined;
  if (signal.severity < policy.criticalityThreshold && riskToScore(signal.risk) < 0.4) return undefined;

  const reason = `threshold:${policy.minimumSeverity}/${policy.criticalityThreshold} severity=${signal.severity}`;
  return {
    policyId: policy.id,
    tenantId: signal.tenantId,
    signalId: signal.id,
    timestamp: new Date().toISOString(),
    reason,
    severity: signal.risk,
  };
};

export const evaluatePolicySet = (
  signals: readonly ContinuitySignal[],
  policies: readonly ContinuityPolicy[],
): readonly ContinuityPolicyResult[] =>
  policies.map((policy) => {
    const matches = matchesPolicySignals(signals, policy);
    const violations = matches
      .map((signal) => evaluatePolicy(signal.tenantId, signal, policy))
      .filter((entry): entry is ContinuityPolicyViolation => entry !== undefined);

    return {
      policy,
      matches: matches.length,
      violations,
      approved: violations.length === 0 && policy.allowAutoMitigation,
    };
  });
