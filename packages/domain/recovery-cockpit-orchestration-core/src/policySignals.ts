import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { evaluatePlanContract, ContractResult } from '@domain/recovery-cockpit-models';
import { buildScenarioTopology, topologyRiskProfile } from './sagaTopology';

export type ScenarioConstraint = Readonly<{
  readonly key: string;
  readonly level: 'green' | 'yellow' | 'amber' | 'red';
  readonly message: string;
  readonly recommendation: string;
}>;

export type PolicyProfile = Readonly<{
  readonly planId: string;
  readonly contract: ContractResult;
  readonly score: number;
  readonly riskScore: number;
  readonly constraints: ReadonlyArray<ScenarioConstraint>;
  readonly riskProfile: ReadonlyArray<{ readonly node: string; readonly risk: number }>;
  readonly laneCount: number;
}>;

const riskToLevel = (value: number): ScenarioConstraint['level'] => {
  if (value >= 75) return 'green';
  if (value >= 60) return 'yellow';
  if (value >= 40) return 'amber';
  return 'red';
};

const deriveActionRiskScore = (plan: RecoveryPlan): number => {
  if (plan.actions.length === 0) {
    return 100;
  }
  const raw = plan.actions.reduce((acc, action) => {
    const criticalBoost = action.tags.includes('critical') ? 15 : 0;
    const durationPenalty = Math.min(25, action.expectedDurationMinutes * 0.2);
    const depPenalty = action.dependencies.length * 2;
    return acc + criticalBoost + durationPenalty + depPenalty;
  }, 0);
  const average = raw / plan.actions.length;
  return Number(Math.max(0, Math.min(100, 100 - average)).toFixed(2));
};

const constraintFromContract = (plan: RecoveryPlan): ScenarioConstraint[] => {
  const contract = evaluatePlanContract(plan);
  const score = Number(contract.score.toFixed(2));
  return contract.clauses.map((entry) => ({
    key: entry.clause.kind,
    level: riskToLevel(score),
    message: `${entry.clause.title}: ${entry.reasons.length > 0 ? entry.reasons.join(', ') : 'ok'}`,
    recommendation: entry.pass ? 'proceed' : 'address-before-run',
  }));
};

const constraintFromTopology = (plan: RecoveryPlan): ScenarioConstraint[] => {
  const topology = buildScenarioTopology(plan);
  const longest = topology.readinessWindowMinutes.reduce((acc, entry) => acc + entry.minutes, 0);
  const density = topology.nodes.length === 0 ? 0 : topology.bottlenecks.length / topology.nodes.length;
  return [
    {
      key: 'topology-density',
      level: density > 0.7 ? 'red' : density > 0.35 ? 'amber' : 'green',
      message: `Bottlenecks ${topology.bottlenecks.length} / ${topology.nodes.length}`,
      recommendation: density > 0.7 ? 're-balance-topology' : 'topology-acceptable',
    },
    {
      key: 'timeline-window',
      level: longest > 240 ? 'amber' : 'green',
      message: `Projected runtime envelope ${longest}m`,
      recommendation: longest > 240 ? 'consider-parallelism-boost' : 'timing-clear',
    },
  ];
};

export const buildPolicyProfile = (plan: RecoveryPlan): PolicyProfile => {
  const contract = evaluatePlanContract(plan);
  const topology = buildScenarioTopology(plan);
  const riskProfile = topologyRiskProfile(topology);
  const riskScore = deriveActionRiskScore(plan);

  return {
    planId: plan.planId,
    contract: contract.result,
    score: contract.score,
    riskScore,
    constraints: [...constraintFromContract(plan), ...constraintFromTopology(plan)],
    riskProfile,
    laneCount: topology.readinessWindowMinutes.length,
  };
};

export const enforcePolicy = (plan: RecoveryPlan): Readonly<{ allowed: boolean; reasons: ReadonlyArray<string> }> => {
  const profile = buildPolicyProfile(plan);
  const blocking = profile.constraints.filter((constraint) => constraint.level === 'red' || constraint.recommendation === 'address-before-run');
  const allowed = profile.contract !== 'violation' && profile.riskScore >= 30 && blocking.length === 0;
  const reasons = [
    ...blocking.map((item) => item.message),
    ...(!allowed ? ['Risk policy gate blocked execution'] : []),
  ];
  return { allowed, reasons };
};
