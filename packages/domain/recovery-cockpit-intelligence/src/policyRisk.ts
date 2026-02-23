import { RecoveryPlan, RecoveryAction, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicies, riskScoreFromChecks, PolicyMode, PolicyCheck } from './policies';

export type RiskProfile = {
  readonly planId: RecoveryPlan['planId'];
  readonly reviewedAt: UtcIsoTimestamp;
  readonly level: 'low' | 'medium' | 'high' | 'critical';
  readonly policyScore: number;
  readonly commandRisk: number;
  readonly complianceRisk: number;
  readonly recommendations: ReadonlyArray<string>;
};

export type PolicyRiskSignal = {
  readonly planId: RecoveryPlan['planId'];
  readonly mode: PolicyMode;
  readonly risk: number;
  readonly reasons: ReadonlyArray<string>;
};

const riskBand = (value: number): RiskProfile['level'] => {
  if (value >= 80) return 'critical';
  if (value >= 55) return 'high';
  if (value >= 30) return 'medium';
  return 'low';
};

const commandRiskScore = (actions: readonly RecoveryAction[]): number =>
  actions.reduce((acc, action) => {
    const duration = action.expectedDurationMinutes;
    const criticalTag = action.tags.includes('critical');
    const hasRetries = action.retriesAllowed > 1;
    return acc + (duration > 90 ? 7 : 3) + (criticalTag ? 12 : 0) + (hasRetries ? 5 : 0);
  }, 0) / Math.max(1, actions.length);

const normalizePolicy = (checks: readonly PolicyCheck[]): ReadonlyArray<string> =>
  [...new Set(checks.flatMap((check) => check.violations).slice(0, 6))];

export const summarizePolicyRisk = (plan: RecoveryPlan, mode: PolicyMode): RiskProfile => {
  const checks = evaluatePlanPolicies(plan, mode);
  const commandRisk = commandRiskScore(plan.actions);
  const policyScore = Number((riskScoreFromChecks(checks)).toFixed(2));
  const complianceRisk = Number(((checks.length - checks.filter((check) => check.allowed).length) * 9 + commandRisk).toFixed(2));
  return {
    planId: plan.planId,
    reviewedAt: new Date().toISOString() as UtcIsoTimestamp,
    level: riskBand((100 - policyScore) + commandRisk),
    policyScore,
    commandRisk,
    complianceRisk,
    recommendations: normalizePolicy(checks),
  };
};

export const mapPolicyRiskSignal = (plan: RecoveryPlan, mode: PolicyMode): PolicyRiskSignal => {
  const profile = summarizePolicyRisk(plan, mode);
  return {
    planId: plan.planId,
    mode,
    risk: Number((100 - profile.policyScore + profile.commandRisk).toFixed(2)),
    reasons: profile.recommendations,
  };
};

export const rankPlansByRisk = (plans: readonly RiskProfile[]): ReadonlyArray<RiskProfile> =>
  [...plans].sort((left, right) => {
    const leftRisk = left.complianceRisk + left.commandRisk;
    const rightRisk = right.complianceRisk + right.commandRisk;
    if (leftRisk === rightRisk) return 0;
    return leftRisk > rightRisk ? -1 : 1;
  });

export const buildRiskSignals = (plan: RecoveryPlan): ReadonlyArray<PolicyRiskSignal> =>
  (['readonly', 'advisory', 'enforce'] as const).map((mode) => {
    const signal = mapPolicyRiskSignal(plan, mode);
    const checks = evaluatePlanPolicies(plan, mode);
    const reasons = [...new Set([...signal.reasons, ...checks.flatMap((check) => check.recommendations)])];
    return {
      ...signal,
      reasons,
      risk: Number((signal.risk + mode.length).toFixed(2)),
    };
  });

export const calculatePolicy = (plan: RecoveryPlan, mode: PolicyMode): number =>
  summarizePolicyRisk(plan, mode).policyScore;

export const combinePolicySignals = (signals: readonly PolicyRiskSignal[]): RiskProfile | undefined => {
  if (!signals.length) {
    return;
  }
  const merged = signals.map((signal) => signal.risk).reduce((acc, value) => acc + value, 0) / signals.length;
  const average = Number(merged.toFixed(2));
  const sample = signals[0];
  if (!sample) {
    return;
  }
  return {
    planId: sample.planId,
    reviewedAt: new Date().toISOString() as UtcIsoTimestamp,
    level: riskBand(average),
    policyScore: Number((average * 0.45).toFixed(2)),
    commandRisk: Number((average * 0.3).toFixed(2)),
    complianceRisk: Number((average * 0.25).toFixed(2)),
    recommendations: [...new Set(signals.flatMap((signal) => signal.reasons))],
  };
};
