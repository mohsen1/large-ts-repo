import { useMemo } from 'react';
import type { RecoveryPlaybookPolicy } from '@domain/recovery-playbook-orchestration';

interface UsePlaybookPolicyMatrixProps {
  readonly policies: ReadonlyArray<RecoveryPlaybookPolicy>;
}

export const usePlaybookPolicyMatrix = ({ policies }: UsePlaybookPolicyMatrixProps) => {
  const rows = useMemo(
    () =>
      policies.map((policy) => ({
        id: policy.id,
        owner: policy.owner,
        name: policy.name,
        dependencies: policy.requiredPolicies,
        forbidden: policy.forbiddenPolicies,
        complexity: policy.requiredPolicies.length + policy.forbiddenPolicies.length,
      })),
    [policies],
  );

  const riskScore = useMemo(() => {
    if (rows.length === 0) {
      return 0;
    }
    const maxComplexity = rows.reduce((acc, row) => Math.max(acc, row.complexity), 0);
    return (maxComplexity / Math.max(1, rows.length)) * 10;
  }, [rows]);

  const policyDensity = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.complexity > 3) {
          acc.high += 1;
        } else if (row.complexity > 0) {
          acc.medium += 1;
        } else {
          acc.low += 1;
        }
        return acc;
      },
      { low: 0, medium: 0, high: 0 },
    );
  }, [rows]);

  return {
    rows,
    riskScore,
    policyDensity,
    policyCount: rows.length,
  };
};
