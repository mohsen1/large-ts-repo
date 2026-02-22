import type { RecoveryReadinessPlan, ReadinessSignal, RecoveryTargetId, RiskBand } from './types';
import { foldSignals } from './signals';

export interface PolicyConstraint {
  key: string;
  minWindowMinutes: number;
  maxWindowMinutes: number;
  minTargetCoveragePct: number;
  forbidParallelity: boolean;
}

export interface ReadinessPolicy {
  policyId: string;
  name: string;
  constraints: PolicyConstraint;
  allowedRegions: Set<string>;
  blockedSignalSources: ReadonlyArray<ReadinessSignal['source']>;
}

export interface ValidationFailure {
  rule: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  failures: ValidationFailure[];
}

export function isSignalAllowed(policy: ReadinessPolicy, signal: ReadinessSignal): boolean {
  if (policy.blockedSignalSources.includes(signal.source)) {
    return false;
  }
  return true;
}

function allowedRegion(policy: ReadinessPolicy, region: string): boolean {
  return policy.allowedRegions.has(region);
}

export function validatePlanTargets(policy: ReadinessPolicy, plan: Pick<RecoveryReadinessPlan, 'targets'>): ValidationResult {
  const failures: ValidationFailure[] = [];

  if (plan.targets.length === 0) {
    failures.push({
      rule: 'targets-required',
      message: 'At least one target is required for a readiness run'
    });
  }

  const uncovered = plan.targets.filter((target) => !allowedRegion(policy, target.region));
  uncovered.forEach((target) => {
    failures.push({
      rule: 'target-region-blocked',
      message: `Target ${target.id} has region ${target.region} blocked by policy`
    });
  });

  const signalCoverage = plan.targets.reduce((acc, target) => {
    acc[target.id] = targetCriticalityScoreFallback(target);
    return acc;
  }, {} as Record<RecoveryTargetId, number>);

  const coveredCount = Object.values(signalCoverage).reduce((sum, score) => sum + score, 0);
  const weightedCoverage = coveredCount / Math.max(plan.targets.length, 1);

  if (weightedCoverage < policy.constraints.minTargetCoveragePct) {
    failures.push({
      rule: 'target-coverage',
      message: `Coverage ${weightedCoverage} below minimum ${policy.constraints.minTargetCoveragePct}`
    });
  }

  return { valid: failures.length === 0, failures };
}

export function validateRiskBand(policy: ReadinessPolicy, signals: ReadinessSignal[]): ValidationResult {
  const summary = foldSignals(signals);
  const failures: ValidationFailure[] = [];

  if (summary.riskBand === 'red' && !policy.constraints.forbidParallelity) {
    failures.push({
      rule: 'risk-band',
      message: 'Policy requires explicit mitigation for red risk band'
    });
  }

  return { valid: failures.length === 0, failures };
}

export function targetCriticalityScoreFallback(input: { criticality: 'low' | 'medium' | 'high' | 'critical' }): number {
  switch (input.criticality) {
    case 'critical':
      return 100;
    case 'high':
      return 70;
    case 'medium':
      return 40;
    case 'low':
      return 20;
  }
}

export function canRunParallel(plan: RecoveryReadinessPlan, policy: ReadinessPolicy): boolean {
  return plan.riskBand !== 'red' || !policy.constraints.forbidParallelity;
}

export function pickPolicyBand(policy: ReadinessPolicy, signals: ReadinessSignal[]): RiskBand {
  const summary = foldSignals(signals);
  if (summary.riskBand === 'red' && policy.constraints.minWindowMinutes < 60) {
    return 'amber';
  }
  return summary.riskBand;
}
