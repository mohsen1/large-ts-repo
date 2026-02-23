import type { DriftSignal, PolicyViolation, PolicyId } from '@domain/recovery-playbook-orchestration';

export const evaluatePolicyGate = (
  signals: readonly DriftSignal[],
  maxCriticalSignals: number,
): PolicyViolation[] => {
  const violations: PolicyViolation[] = [];
  const critical = signals.filter((signal) => signal.severity === 'critical');

  if (critical.length > maxCriticalSignals) {
    violations.push({
      policyId: `policy-critical-threshold` as PolicyId,
      reason: `criticalSignals=${critical.length} > ${maxCriticalSignals}`,
      severity: 'critical',
    });
  }

  const byPolicy = new Map<string, number>();
  for (const signal of signals) {
    byPolicy.set(signal.signal, (byPolicy.get(signal.signal) ?? 0) + 1);
  }

  for (const [policy, count] of byPolicy) {
    if (count > 6) {
      violations.push({
        policyId: `policy-${policy}` as PolicyId,
        reason: `duplicateSignal=${count}`,
        severity: 'high',
      });
    }
  }

  return violations;
};
