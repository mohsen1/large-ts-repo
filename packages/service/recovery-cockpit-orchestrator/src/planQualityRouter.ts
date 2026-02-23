import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicy } from './policyEngine';
import { buildDependencyInsight, summarizeDependencyRisk } from '@domain/recovery-cockpit-intelligence';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';
import { evaluatePlanSla, summarizeConstraintHealth } from '@domain/recovery-cockpit-models';
import { buildReadinessProfile } from '@domain/recovery-cockpit-workloads';

export type QualityPath = 'fast' | 'safe' | 'balanced';

export type QualityProfile = {
  readonly plan: RecoveryPlan;
  readonly policy: ReturnType<typeof evaluatePlanPolicy>;
  readonly dependencyHealth: string;
  readonly forecastSummary: number;
  readonly slaScore: number;
  readonly recommendedPath: QualityPath;
  readonly readiness: ReturnType<typeof buildReadinessProfile>;
};

export type QualityDecision = {
  readonly planId: string;
  readonly recommendation: QualityPath;
  readonly rationale: string[];
  readonly score: number;
};

const scoreForecast = (plan: RecoveryPlan): number => {
  const forecast = buildPlanForecast(plan, 'balanced');
  return forecast.summary;
};

const riskToPath = (policyViolations: number, slaScore: number): QualityPath => {
  if (policyViolations > 1 || slaScore < 50) return 'safe';
  if (slaScore < 70) return 'balanced';
  return 'fast';
};

export const buildQualityProfiles = (plans: readonly RecoveryPlan[]): readonly QualityProfile[] =>
  plans.map((plan) => {
    const policy = evaluatePlanPolicy(plan, 'advisory');
    const dependencies = buildDependencyInsight(plan);
    const sla = evaluatePlanSla(plan);
    const forecastSummary = scoreForecast(plan);
    const readiness = buildReadinessProfile(plan);
    return {
      plan,
      policy,
      dependencyHealth: summarizeDependencyHealth(dependencies),
      forecastSummary,
      slaScore: sla.overallScore,
      recommendedPath: riskToPath(policy.violationCount, sla.overallScore),
      readiness,
    };
  });

const summarizeDependencyHealth = (insight: ReturnType<typeof buildDependencyInsight>): string =>
  `${insight.health}:${insight.criticalPath.length} critical`;

const scoreFromProfile = (profile: QualityProfile): number => {
  const readinessDelta = profile.readiness.mean;
  const base = profile.slaScore;
  const [health] = profile.dependencyHealth.split(':');
  const healthPenalty = health === 'healthy' ? 0 : health === 'fragile' ? 10 : 20;
  return Number((base + readinessDelta - profile.policy.violationCount * 5 - healthPenalty).toFixed(2));
};

export const routePlan = (plan: RecoveryPlan): QualityDecision => {
  const profile = buildQualityProfiles([plan])[0];
  if (!profile) {
    return {
      planId: plan.planId,
      recommendation: 'balanced',
      rationale: ['No profile produced'],
      score: 0,
    };
  }
  return {
    planId: plan.planId,
    recommendation: profile.recommendedPath,
    rationale: [
      summarizeConstraintHealth(plan),
      profile.dependencyHealth,
      `forecast=${profile.forecastSummary.toFixed(2)}`,
      `readiness=${profile.readiness.mean.toFixed(2)}`,
    ],
    score: scoreFromProfile(profile),
  };
};

export const comparePlans = (
  plans: readonly RecoveryPlan[],
): ReadonlyArray<QualityDecision> =>
  [...plans]
    .map((plan) => routePlan(plan))
    .sort((left, right) => right.score - left.score);
