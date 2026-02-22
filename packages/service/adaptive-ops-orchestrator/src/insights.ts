import { AdaptiveDecision, AdaptivePolicy, SignalSample } from '@domain/adaptive-ops';

export interface RunInsight {
  tenantId: string;
  signalKinds: readonly string[];
  topPolicyIds: readonly string[];
  topDecisionRisk: AdaptiveDecision['risk'];
  actionIntensityAvg: number;
  policyCoverage: number;
}

export const summarizeSignals = (signals: readonly SignalSample[]): readonly string[] => {
  const sorted = new Set(signals.map((signal) => signal.kind));
  return Array.from(sorted.values());
}

export const topPolicies = (decisions: readonly AdaptiveDecision[]): readonly string[] => {
  return [...decisions]
    .map((decision) => decision.policyId)
    .filter((policyId, index, all) => all.indexOf(policyId) === index)
    .slice(0, 5);
}

const riskRank = (risk: AdaptiveDecision['risk']): number => {
  switch (risk) {
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
    case 'critical':
      return 4;
  }
};

export const coverageScore = (policies: readonly AdaptivePolicy[], decisions: readonly AdaptiveDecision[]): number => {
  if (policies.length === 0) return 0;
  const uniquePolicies = new Set<string>(decisions.map((decision) => decision.policyId));
  return uniquePolicies.size / policies.length;
};

export const summarizeDecisions = (tenantId: string, policies: readonly AdaptivePolicy[], decisions: readonly AdaptiveDecision[]): RunInsight => {
  const averageIntensity = decisions.reduce((acc, decision) => acc + decision.selectedActions.reduce((sum, action) => sum + action.intensity, 0), 0);
  const actionCount = decisions.reduce((acc, decision) => acc + decision.selectedActions.length, 0);
  const bestRisk = [...decisions].sort((left, right) => riskRank(right.risk) - riskRank(left.risk))[0]?.risk ?? 'low';
  const signalKinds = Array.from(new Set(decisions.flatMap((decision) => decision.selectedActions.flatMap((action) => action.targets))));

  return {
    tenantId,
    signalKinds,
    topPolicyIds: topPolicies(decisions),
    topDecisionRisk: bestRisk,
    actionIntensityAvg: actionCount === 0 ? 0 : averageIntensity / actionCount,
    policyCoverage: coverageScore(policies, decisions),
  };
}
