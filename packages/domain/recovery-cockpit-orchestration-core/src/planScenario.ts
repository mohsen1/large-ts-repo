import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { normalizeNumber, groupBy } from '@shared/util';
import { buildPolicyProfile, enforcePolicy } from './policySignals';
import { buildScenarioTopology, summarizeTopology } from './sagaTopology';

export type ScenarioRunState = Readonly<{
  readonly planId: string;
  readonly state: 'queued' | 'ready' | 'blocked' | 'running' | 'needs-review';
  readonly readinessScore: number;
  readonly policyAllowed: boolean;
  readonly riskScore: number;
  readonly policyRecommendations: ReadonlyArray<string>;
}>;

export type ScenarioRunEnvelope = Readonly<{
  readonly plan: RecoveryPlan;
  readonly topologySummary: string;
  readonly lanes: ReadonlyArray<{ node: string; risk: number }>;
  readonly state: ScenarioRunState;
}>;

const readinessBaseline = (plan: RecoveryPlan): number => {
  const safety = plan.isSafe ? 40 : 0;
  const duration = plan.slaMinutes;
  const actionCount = plan.actions.length;
  const regionCount = new Set(plan.actions.map((action) => action.region)).size;
  const complexity = Math.min(30, actionCount * 1.5 + regionCount * 4);
  return normalizeNumber(100 - complexity - Math.max(0, duration - 120) * 0.15 + safety);
};

const buildReadinessFromProfile = (plan: RecoveryPlan): number => {
  const profile = buildPolicyProfile(plan);
  const riskBand = profile.constraints.length === 0 ? 100 : Math.min(100, profile.score + (90 - profile.riskScore) + profile.laneCount * 2);
  const readinessValue = (readinessBaseline(plan) + riskBand) / 2;
  const bounded = Math.max(10, Math.min(100, readinessValue));
  return normalizeNumber(bounded);
};

const inferState = (readiness: number, allowed: boolean): ScenarioRunState['state'] => {
  if (!allowed) return 'needs-review';
  if (readiness >= 85) return 'ready';
  if (readiness >= 55) return 'queued';
  return 'blocked';
};

const regionLoadSummary = (plan: RecoveryPlan): ReadonlyArray<{ region: string; actions: number; avgDuration: number }> => {
  const grouped = groupBy(plan.actions, (action) => action.region);
  return grouped.map((group) => {
    const avgDuration = group.values.reduce((acc, action) => acc + action.expectedDurationMinutes, 0) / Math.max(1, group.values.length);
    return {
      region: group.key,
      actions: group.values.length,
      avgDuration: normalizeNumber(avgDuration),
    };
  });
};

export const buildScenarioRunState = (plan: RecoveryPlan): ScenarioRunState => {
  const profile = buildPolicyProfile(plan);
  const readinessScore = buildReadinessFromProfile(plan);
  const { allowed } = enforcePolicy(plan);
  const recommendations = profile.constraints.filter((item) => item.level !== 'green').map((item) => item.message);

  return {
    planId: plan.planId,
    state: inferState(readinessScore, allowed),
    readinessScore,
    policyAllowed: allowed,
    riskScore: profile.riskScore,
    policyRecommendations: [...new Set(recommendations)],
  };
};

export const buildScenarioEnvelope = (plan: RecoveryPlan): ScenarioRunEnvelope => {
  const topology = buildScenarioTopology(plan);
  const state = buildScenarioRunState(plan);
  return {
    plan,
    topologySummary: summarizeTopology(topology),
    lanes: [...topology.nodes].map((node) => ({ node: node.actionId, risk: node.riskFactor })),
    state,
  };
};

export const summarizeScenarioRuns = (plans: readonly RecoveryPlan[]): ReadonlyArray<ScenarioRunState> => {
  return plans.map(buildScenarioRunState);
};

export const groupScenarioHealth = (plans: readonly RecoveryPlan[]): ReadonlyArray<{ state: ScenarioRunState['state']; count: number }> => {
  const runs = summarizeScenarioRuns(plans);
  const byState = new Map<ScenarioRunState['state'], number>();
  for (const run of runs) {
    byState.set(run.state, (byState.get(run.state) ?? 0) + 1);
  }
  return [...byState.entries()].map(([state, count]) => ({ state, count }));
};

export const regionReadiness = (plan: RecoveryPlan): ReadonlyArray<{ region: string; actions: number; avgDuration: number }> => {
  return regionLoadSummary(plan);
};
