import { AdaptivePolicy, AdaptiveDecision, SignalKind } from '@domain/adaptive-ops';
import { DecisionDensity, HealthSignal, PolicyHealthState } from './types';

export interface CoverageReport {
  tenantId: string;
  policies: readonly AdaptivePolicy[];
  summary: {
    totalPolicies: number;
    activePolicies: number;
    totalDecisions: number;
    conflictCount: number;
  };
  densities: readonly DecisionDensity[];
  hotspots: readonly HealthSignal[];
  graphDensity: number;
}

const estimateConflictBuckets = (decisions: readonly AdaptiveDecision[]): number => {
  const serviceMap = new Map<string, Set<string>>();
  for (const decision of decisions) {
    const targets = decision.selectedActions.flatMap((action) => action.targets);
    for (const source of targets) {
      const existing = serviceMap.get(source) ?? new Set<string>();
      for (const target of targets) {
        if (source !== target) {
          existing.add(target);
        }
      }
      serviceMap.set(source, existing);
    }
  }

  const conflicts = new Set<string>();
  for (const [source, targets] of serviceMap) {
    for (const target of targets) {
      conflicts.add(`${[source, target].sort().join(':')}`);
    }
  }
  return conflicts.size;
};

export const buildDecisionDensity = (
  policies: readonly AdaptivePolicy[],
  decisions: readonly AdaptiveDecision[],
): readonly DecisionDensity[] => {
  const byPolicy = new Map<string, AdaptiveDecision[]>();
  for (const decision of decisions) {
    const key = `${decision.policyId}`;
    const entries = byPolicy.get(key) ?? [];
    entries.push(decision);
    byPolicy.set(key, entries);
  }

  return policies.map((policy) => {
    const policyDecisions = byPolicy.get(`${policy.id}`) ?? [];
    const actionCount = policyDecisions.reduce((acc, decision) => acc + decision.selectedActions.length, 0);
    const highRisk = policyDecisions.filter((decision) => decision.risk === 'high' || decision.risk === 'critical').length;
    const avgConfidence = policyDecisions.length === 0
      ? 0
      : policyDecisions.reduce((acc, decision) => acc + decision.confidence, 0) / policyDecisions.length;

    return {
      policyId: `${policy.id}`,
      policyName: policy.name,
      actionCount,
      avgConfidence,
      highRiskActionCount: highRisk,
    };
  });
};

export const healthFromDecisions = (
  policies: readonly AdaptivePolicy[],
  decisions: readonly AdaptiveDecision[],
): PolicyHealthState => {
  const actionSignals = new Set<string>();
  const conflictCount = estimateConflictBuckets(decisions);
  const serviceBuckets = new Map<string, number>();

  for (const decision of decisions) {
    const targets = decision.selectedActions.flatMap((action) => action.targets);
    for (const target of targets) {
      actionSignals.add(target);
      serviceBuckets.set(target, (serviceBuckets.get(target) ?? 0) + 1);
    }
  }

  const topSignals = Array.from(serviceBuckets.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([target, score]): HealthSignal => ({
      policyId: target,
      severity: score > 8 ? 'critical' : score > 4 ? 'high' : score > 1 ? 'medium' : 'low',
      score,
      activeSignals: ['manual-flag', 'error-rate'] as readonly SignalKind[],
    }));

  return {
    tenantId: `${decisions[0]?.incidentId ?? 'tenant-unknown'}`,
    policies,
    activePolicyIds: Array.from(new Set(decisions.map((decision) => `${decision.policyId}`))),
    decisionCount: decisions.length,
    conflictCount,
    decisionDensity: buildDecisionDensity(policies, decisions).filter((entry) => entry.actionCount > 0),
    topSignals,
  };
};

export const computeGraphDensity = (policies: readonly AdaptivePolicy[]): number => {
  if (policies.length === 0) return 0;
  const dependent = policies.filter((policy) => policy.dependencies.length > 0).length;
  return dependent / policies.length;
};

export const buildCoverageReport = (
  tenantId: string,
  policies: readonly AdaptivePolicy[],
  decisions: readonly AdaptiveDecision[],
): CoverageReport => {
  const densities = buildDecisionDensity(policies, decisions);
  const policyHealth = healthFromDecisions(policies, decisions);
  const summary = {
    totalPolicies: policies.length,
    activePolicies: policies.filter((policy) => policy.active).length,
    totalDecisions: decisions.length,
    conflictCount: policyHealth.conflictCount,
  };

  return {
    tenantId,
    policies,
    summary,
    densities,
    hotspots: policyHealth.topSignals,
    graphDensity: computeGraphDensity(policies),
  };
};
