import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NamespaceTag, PolicyId } from '@domain/recovery-ecosystem-core';
import {
  buildTopology,
  buildPolicyPlan,
  collectTopologyDigest,
  loadTopologyTimeline,
  runAsTopologyDigest,
  normalizePolicySet,
  type EcosystemTopologyPolicyInput,
  topologyDefaults,
} from '../services/topologyService';
import type { TopologyResult } from '@service/recovery-ecosystem-orchestrator';
import type { Result } from '@shared/result';
import { asHealthScore } from '@domain/recovery-ecosystem-core';

interface PolicyTopologyRow {
  readonly policy: PolicyId;
  readonly enabled: boolean;
  readonly signature: string;
}

interface TopologyState {
  readonly namespace: NamespaceTag;
  readonly policies: readonly PolicyTopologyRow[];
  readonly score: number;
  readonly loading: boolean;
  readonly error?: string;
  readonly digest: string;
}

interface TopologyActions {
  readonly refresh: () => Promise<void>;
  readonly togglePolicy: (policy: string) => void;
  readonly runPlan: () => Promise<Result<TopologyResult>>;
  readonly loadTimeline: (runId: string) => Promise<void>;
}

const policySignature = (policy: string): string => `policy:${policy}`;

export const useEcosystemTopology = (tenantId = 'tenant:default', namespace = 'namespace:recovery-ecosystem'): {
  readonly state: TopologyState;
  readonly actions: TopologyActions;
  readonly summary: string;
} => {
  const [policies, setPolicies] = useState<readonly PolicyTopologyRow[]>([
    { policy: 'policy:baseline' as PolicyId, enabled: true, signature: 'policy:baseline' },
    { policy: 'policy:observability' as PolicyId, enabled: true, signature: 'policy:observability' },
    { policy: 'policy:forecast' as PolicyId, enabled: false, signature: 'policy:forecast' },
  ]);
  const [topologyScore, setTopologyScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [digest, setDigest] = useState('');
  const [timeline, setTimeline] = useState<readonly { runId: string; namespace: string; stage: string }[]>([]);

  const signature = useMemo(() => normalizePolicySet(policies.map((entry) => entry.policy)), [policies]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const plan: EcosystemTopologyPolicyInput = {
        tenantId,
        namespace,
        activePolicies: policies.filter((entry) => entry.enabled).map((entry) => entry.policy),
      };
      const result = await buildPolicyPlan(plan);
      if (!result.ok) {
        throw result.error;
      }
      setTopologyScore(asHealthScore(result.value.summary.score));
      const topology = await buildTopology(tenantId, namespace, plan.activePolicies);
      if (!topology.ok) {
        throw topology.error;
      }
      setDigest(`${plan.namespace}:${result.value.summary.laneCount}:${topology.value.queryDigest.runCount}`);
      const snapshot = await collectTopologyDigest(topologyDefaults.namespace as NamespaceTag);
      if (snapshot.ok) {
        setDigest(`${snapshot.value.summary.fingerprint}:${snapshot.value.summary.batch.eventCount}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [tenantId, namespace, policies]);

  const togglePolicy = useCallback((policy: string): void => {
    setPolicies((current) =>
      current
        .map((entry) =>
          entry.policy === policy ? { ...entry, enabled: !entry.enabled, signature: policySignature(entry.policy) } : entry,
        )
        .sort((left, right) => Number(left.enabled) - Number(right.enabled)),
    );
  }, []);

  const runPlan = useCallback(async () => {
    const activePolicies = policies.filter((entry) => entry.enabled).map((entry) => entry.policy);
    const result = await buildTopology(tenantId, namespace, activePolicies);
    if (!result.ok) {
      setError(result.error.message);
      return result;
    }
    return result;
  }, [tenantId, namespace, policies]);

  const loadTimeline = useCallback(async (runId: string): Promise<void> => {
    const timelineResult = await loadTopologyTimeline(topologyDefaults.namespace as NamespaceTag, runId);
    if (!timelineResult.ok) {
      setError(timelineResult.error.message);
      return;
    }
    setTimeline(timelineResult.value);
  }, []);

  useEffect(() => {
    void refresh();
    void runAsTopologyDigest(tenantId, topologyDefaults.namespace as NamespaceTag);
  }, [refresh, tenantId]);

  const summary = useMemo(
    () => `Policies=${policies.length}; enabled=${policies.filter((entry) => entry.enabled).length}; score=${topologyScore}`,
    [policies, topologyScore],
  );

  const _timeline = timeline;
  void _timeline;

  return {
    state: {
      namespace: namespace as NamespaceTag,
      policies,
      score: topologyScore,
      loading,
      error,
      digest,
    },
    actions: {
      refresh,
      togglePolicy,
      runPlan,
      loadTimeline,
    },
    summary,
  };
};

export const policySignatureRows = (entries: readonly PolicyTopologyRow[]): readonly [string, number][] => {
  const map = new Map<string, number>();
  for (const entry of entries) {
    map.set(entry.signature, entry.enabled ? 1 : 0);
  }
  return [...map.entries()].toSorted((left, right) => right[1] - left[1]);
};

export const useTopologySignature = (tenantId: string, namespace: string): string =>
  useMemo(() => `${tenantId}:${namespace}:${topologyDefaults.namespace}`, [tenantId, namespace]);
