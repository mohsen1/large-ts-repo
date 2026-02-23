import { useMemo } from 'react';
import type {
  CommandNetworkSnapshot,
  DriftObservation,
  RuntimeIntent,
  RoutingDecision,
  PolicyRule,
} from '@domain/recovery-command-network';

export interface SignalFilters {
  readonly policyId?: string;
  readonly minScore?: number;
}

export interface SignalBucket {
  readonly kind: 'decision' | 'drift' | 'intent';
  readonly count: number;
  readonly items: readonly string[];
}

export interface SignalSummary {
  readonly buckets: readonly SignalBucket[];
  readonly totalSignals: number;
}

const toDriftReason = (drift: readonly DriftObservation[]) => drift.map((item) => `${item.policyId}:${item.drift}:${item.reason}`);

const toDecisionReason = (decisions: readonly RoutingDecision[]) =>
  decisions
    .map((entry) => ({
      label: `${entry.nodeId} ${entry.score.toFixed(2)} ${entry.accepted ? 'allow' : 'block'}`,
      score: entry.score,
      policyId: entry.policyId,
    }))
    .filter((entry) => entry.score >= 0);

const toIntentReason = (intents: readonly { intentId: string; priority: string }[]) => intents.map((intent) => `${intent.intentId} priority=${intent.priority}`);

export const useCommandNetworkSignals = (
  snapshot: CommandNetworkSnapshot | null,
  intents: readonly RuntimeIntent[],
  decisions: readonly RoutingDecision[],
  drifts: readonly DriftObservation[],
  filters: SignalFilters = {},
) => {
  const policyIndex = useMemo(() => {
    const map = new Map<string, PolicyRule>();
    if (!snapshot) {
      return map;
    }
    for (const policy of snapshot.policies) {
      map.set(policy.policyId, policy);
    }
    return map;
  }, [snapshot]);

  const filteredDecisions = useMemo(() => {
    const minScore = filters.minScore ?? 0;
    return decisions.filter((decision) => {
      if (filters.policyId && decision.policyId !== filters.policyId) {
        return false;
      }
      if (decision.score < minScore) {
        return false;
      }
      if (filters.policyId) {
      const policy = policyIndex.get(decision.policyId);
        if (policy?.windowHours && policy.windowHours < 1) {
          return false;
        }
      }
      return true;
    });
  }, [decisions, filters, policyIndex]);

  const buckets: SignalBucket[] = [
    {
      kind: 'decision',
      count: filteredDecisions.length,
      items: toDecisionReason(filteredDecisions).map((entry) => entry.label),
    },
    {
      kind: 'drift',
      count: drifts.length,
      items: toDriftReason(drifts),
    },
    {
      kind: 'intent',
      count: intents.length,
      items: toIntentReason(intents),
    },
  ];

  const summary: SignalSummary = {
    buckets,
    totalSignals: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
  };

  return {
    summary,
    acceptedCount: filteredDecisions.filter((entry) => entry.accepted).length,
    rejectedCount: filteredDecisions.filter((entry) => !entry.accepted).length,
  };
};
