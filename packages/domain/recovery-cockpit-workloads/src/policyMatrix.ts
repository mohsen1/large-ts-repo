import { RecoveryAction, RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildTopologySnapshot, ServiceTopologyNode } from './topology';

export type PolicyDimension =
  | 'blastRadius'
  | 'parallelismSafety'
  | 'rollbackSafety'
  | 'dependencyClosure'
  | 'sloImpact';

export type PolicyFactor = {
  readonly dimension: PolicyDimension;
  readonly score: number;
  readonly rationale: string;
  readonly suggestions: readonly string[];
};

export type PlanPolicySignature = {
  readonly planId: string;
  readonly overallScore: number;
  readonly factors: readonly PolicyFactor[];
  readonly riskClassification: 'green' | 'yellow' | 'red';
  readonly generatedAt: number;
};

const scaleScore = (value: number): number => Math.max(0, Math.min(100, value));

const computeBlastRadius = (nodes: readonly ServiceTopologyNode[]): number => {
  if (nodes.length === 0) return 0;
  const critical = nodes.filter((node) => node.criticality === 'critical').length;
  const high = nodes.filter((node) => node.criticality === 'high').length;
  const medium = nodes.filter((node) => node.criticality === 'medium').length;
  const weighted = critical * 12 + high * 7 + medium * 2 + nodes.length;
  return scaleScore(120 - Math.min(120, weighted));
};

const computeParallelismSafety = (nodes: readonly ServiceTopologyNode[]): number => {
  const maxDependencies = Math.max(...nodes.map((node) => node.dependencies.length), 1);
  const avgDependency = nodes.reduce((sum, node) => sum + node.dependencies.length, 0) / Math.max(1, nodes.length);
  const risk = avgDependency + maxDependencies * 2 + nodes.length / 12;
  return scaleScore(100 - risk);
};

const computeRollbackSafety = (actions: readonly RecoveryAction[]): number => {
  const unsafe = actions.filter((action) => action.command.includes('delete') || action.command.includes('purge')).length;
  const long = actions.filter((action) => action.expectedDurationMinutes > 40).length;
  const safeCount = actions.length - unsafe - long;
  return scaleScore((safeCount / Math.max(1, actions.length)) * 100);
};

const computeDependencyClosure = (snapshot: ReturnType<typeof buildTopologySnapshot>): number => {
  const unresolved = snapshot.edges.filter((edge) => edge.reason === 'blast-radius').length;
  const total = snapshot.edges.length;
  if (total === 0) return 100;
  return scaleScore(100 - (unresolved / total) * 100);
};

const computeSloImpact = (plan: RecoveryPlan): number => {
  if (plan.slaMinutes <= 0) return 100;
  const target = plan.slaMinutes;
  const durationRatio = Math.min(2, plan.actions.reduce((sum, action) => sum + action.expectedDurationMinutes, 0) / target);
  return scaleScore(100 - durationRatio * 38);
};

const factorFromScore = (score: number, dimension: PolicyDimension): PolicyFactor => {
  if (score >= 80) {
    return {
      dimension,
      score,
      rationale: `${dimension} has sufficient margins`,
      suggestions: ['No immediate action required'],
    };
  }
  if (score >= 60) {
    return {
      dimension,
      score,
      rationale: `${dimension} is acceptable with minor risk`,
      suggestions: ['Add targeted guardrails', 'Run pre-check before execution'],
    };
  }
  return {
    dimension,
    score,
    rationale: `${dimension} shows risk signal`,
    suggestions: ['Split the plan into smaller segments', 'Introduce staged rollback hooks'],
  };
};

export const buildPolicySignature = (plan: RecoveryPlan): PlanPolicySignature => {
  const snapshot = buildTopologySnapshot(plan);
  const nodes = Array.from(snapshot.nodesById.values());
  const blastRadius = computeBlastRadius(nodes);
  const parallelismSafety = computeParallelismSafety(nodes);
  const rollbackSafety = computeRollbackSafety(plan.actions);
  const dependencyClosure = computeDependencyClosure(snapshot);
  const sloImpact = computeSloImpact(plan);

  const factors: PolicyFactor[] = [
    factorFromScore(blastRadius, 'blastRadius'),
    factorFromScore(parallelismSafety, 'parallelismSafety'),
    factorFromScore(rollbackSafety, 'rollbackSafety'),
    factorFromScore(dependencyClosure, 'dependencyClosure'),
    factorFromScore(sloImpact, 'sloImpact'),
  ];

  const overallScore = scaleScore(
    factors.reduce((sum, factor) => sum + factor.score, 0) / factors.length,
  );

  const red = factors.some((factor) => factor.score < 50);
  const yellow = factors.some((factor) => factor.score < 70);

  return {
    planId: plan.planId,
    overallScore,
    factors,
    riskClassification: red ? 'red' : yellow ? 'yellow' : 'green',
    generatedAt: Date.now(),
  };
};

export const topRiskFactors = (signatures: readonly PlanPolicySignature[]): ReadonlyArray<{ planId: string; factorCount: number }> =>
  signatures
    .map((signature) => ({
      planId: signature.planId,
      factorCount: signature.factors.filter((factor) => factor.score < 70).length,
    }))
    .sort((left, right) => right.factorCount - left.factorCount);
