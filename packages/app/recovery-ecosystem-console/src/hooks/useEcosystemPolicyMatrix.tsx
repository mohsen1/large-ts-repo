import { useCallback, useMemo, useState } from 'react';
import type { NamespaceTag, PolicyId } from '@domain/recovery-ecosystem-core';
import { asPolicyId } from '@domain/recovery-ecosystem-core';
import { collectTopologyDigest } from '../services/topologyService';
import type { TopologyDigest } from '@service/recovery-ecosystem-orchestrator';

export interface PolicyMatrixCell {
  readonly policy: PolicyId;
  readonly active: boolean;
  readonly score: number;
}

interface MatrixState {
  readonly policyCount: number;
  readonly activePolicyCount: number;
  readonly digest: string;
  readonly loading: boolean;
}

interface MatrixActions {
  readonly refresh: () => Promise<void>;
  readonly toggle: (policy: string) => void;
  readonly reset: () => void;
}

const policyList = (count: number): readonly PolicyId[] =>
  Array.from({ length: count }, (_entry, index) => asPolicyId(`auto-${index}`));

const policyScore = (active: readonly PolicyId[], policy: PolicyId): number =>
  active.includes(policy) ? 100 : 0;

const collectDigest = async (namespace: NamespaceTag): Promise<{ readonly value: TopologyDigest | undefined; readonly ok: boolean }> => {
  const output = await collectTopologyDigest(namespace);
  return output.ok ? { value: output.value, ok: true } : { value: undefined, ok: false };
};

export const useEcosystemPolicyMatrix = (namespace: NamespaceTag, policyCount = 5): {
  readonly state: MatrixState;
  readonly matrix: readonly PolicyMatrixCell[];
  readonly actions: MatrixActions;
  readonly enabledDigest: string;
} => {
  const [active, setActive] = useState<readonly PolicyId[]>(policyList(policyCount));
  const [digest, setDigest] = useState('policy-matrix:empty');
  const [loading, setLoading] = useState(false);

  const matrix = useMemo(
    () =>
      active.map((policy) => ({
        policy,
        active: active.includes(policy),
        score: policyScore(active, policy),
      })),
    [active],
  );

  const toggle = useCallback((policy: string) => {
    const normalized = asPolicyId(`policy:${policy}`);
    setActive((current) => {
      const exists = current.includes(normalized);
      const next = exists
        ? current.filter((entry) => entry !== normalized)
        : [...current, normalized];
      return [...next].toSorted();
    });
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const payload = await collectDigest(namespace);
      if (payload.ok && payload.value) {
        setDigest(`${payload.value.summary.fingerprint}:${payload.value.summary.batch.signatures.length}`);
        const derived = payload.value.summary.batch.signatures
          .map((signature) => asPolicyId(`policy-${signature.slice(0, 8)}`))
          .slice(0, policyCount);
        setActive((current) => [...new Set([...current, ...derived])] as readonly PolicyId[]);
      }
    } finally {
      setLoading(false);
    }
  }, [namespace, policyCount]);

  const reset = useCallback(() => {
    setActive(policyList(policyCount));
  }, [policyCount]);

  return {
    state: {
      policyCount,
      activePolicyCount: active.length,
      digest,
      loading,
    },
    matrix,
    actions: {
      refresh,
      toggle,
      reset,
    },
    enabledDigest: active
      .filter((policy) => active.includes(policy))
      .toSorted()
      .join('|'),
  };
};

export const createPolicyMatrix = (count = 5): readonly PolicyMatrixCell[] =>
  policyList(count).map((policy) => ({ policy, active: true, score: 100 }));
