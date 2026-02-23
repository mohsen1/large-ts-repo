import type { CommandPolicy, PolicyRule, RuntimeIntent, PlanWindow, CommandNetworkEdge } from './types';

interface WindowHealth {
  readonly totalEdges: number;
  readonly healthyEdges: number;
  readonly healthyRatio: number;
}

export const computeEdgeHealth = (edges: readonly CommandNetworkEdge[]): WindowHealth => {
  const totalEdges = edges.length;
  const healthyEdges = edges.filter((edge) => edge.meta.errorRatePercent <= 2 && edge.meta.latencyMsP95 <= 1200).length;
  return {
    totalEdges,
    healthyEdges,
    healthyRatio: Number((totalEdges === 0 ? 0 : healthyEdges / totalEdges).toFixed(4)),
  };
};

export const computePolicyPressure = (policies: readonly PolicyRule[]): number => {
  if (policies.length === 0) {
    return 0;
  }

  const score = policies.reduce((sum, policy) => {
    const baseLatencyOk = policy.maxLatencyMs <= 2000 ? 1 : 0.4;
    const auditPenalty = policy.requireAudit ? 0.1 : 0;
    const windowPenalty = policy.windowHours < 1 ? 0.25 : 0;
    return sum + baseLatencyOk + (1 / Math.max(1, policy.channels.length)) - auditPenalty - windowPenalty;
  }, 0);

  return Number((score / policies.length).toFixed(3));
};

export const computeSchedulingWindow = (intents: readonly RuntimeIntent[], policies: readonly PolicyRule[]) => {
  if (intents.length === 0) {
    return {
      totalSeconds: 0,
      openWindows: 0,
      policyPressure: computePolicyPressure(policies),
    };
  }

  const windows = intents.map((intent) => intent.targetWindow);
  const earliest = windows.reduce((acc, window) => Math.min(acc, Date.parse(window.fromUtc)), Number.POSITIVE_INFINITY);
  const latest = windows.reduce((acc, window) => Math.max(acc, Date.parse(window.toUtc)), Number.NEGATIVE_INFINITY);

  const totalSeconds = Math.max(0, Math.floor((latest - earliest) / 1000));
  const policyPressure = computePolicyPressure(policies);
  return {
    totalSeconds,
    openWindows: windows.length,
    policyPressure,
  };
};

export const summarizeWindow = (window: PlanWindow): string => {
  const duration = Math.max(0, Date.parse(window.toUtc) - Date.parse(window.fromUtc));
  const minutes = Math.floor(duration / 60000);
  return `${window.windowId}: ${window.runbooks.length} runbooks (${minutes}m)`;
};

export const rankPolicies = (policies: readonly PolicyRule[]): PolicyRule[] =>
  [...policies]
    .map((policy) => ({
      ...policy,
      pressure: computePolicyPressure([policy]),
    }))
    .sort((left, right) => right.pressure - left.pressure);
