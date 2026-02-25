import { useMemo, useState } from 'react';

export const useRecoveryLensPolicies = (namespace: string): readonly string[] => {
  const [policies] = useState<readonly string[]>(['ingest', 'normalize', 'validate', 'persist', 'publish']);
  const filtered = useMemo(() => policies.filter((policy) => policy.includes(namespace.length > 0 ? namespace.split(':').pop() ?? '' : policy)), [namespace, policies]);
  return filtered;
};

export const renderPolicyMatrix = (policies: readonly string[]): string => policies.join('|');
