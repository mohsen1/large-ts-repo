import { useMemo, useState } from 'react';
import { useRecoveryOpsOrchestrationLab } from '../hooks/useRecoveryOpsOrchestrationLab';
import type { OrchestrationPolicy } from '@domain/recovery-ops-orchestration-lab';
import { RecoveryOpsPolicyMatrix } from '../components/RecoveryOpsPolicyMatrix';

const BASE_POLICIES = [
  {
    id: 'policy-fast' as OrchestrationPolicy['id'],
    tenantId: 'tenant-global',
    maxParallelSteps: 6,
    minConfidence: 0.5,
    allowedTiers: ['signal', 'warning', 'critical'] as const,
    minWindowMinutes: 8,
    timeoutMinutes: 120,
  },
  {
    id: 'policy-safe' as OrchestrationPolicy['id'],
    tenantId: 'tenant-global',
    maxParallelSteps: 2,
    minConfidence: 0.85,
    allowedTiers: ['critical'] as const,
    minWindowMinutes: 14,
    timeoutMinutes: 300,
  },
] satisfies readonly OrchestrationPolicy[];

const format = (value: unknown): string => {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  if (Array.isArray(value)) {
    return `${value.length}`;
  }
  return String(value);
};

export const RecoveryOpsLabPolicyPage = () => {
  const [selectedPolicyIndex, setSelectedPolicyIndex] = useState(0);
  const selectedPolicy = BASE_POLICIES[selectedPolicyIndex] ?? BASE_POLICIES[0];

  const { lab, planCount, signalCount, isRunning, runOrchestratedLab, run } =
    useRecoveryOpsOrchestrationLab({
      tenant: 'tenant-global',
      policy: selectedPolicy,
    });

  const selectedPlanId = run?.commandResult.chosenPlanId;

  const summary = useMemo(() => {
    return {
      selected: selectedPolicy.id,
      plans: planCount,
      signals: signalCount,
      parallel: selectedPolicy.maxParallelSteps,
      confidence: format(selectedPolicy.minConfidence),
      window: `${selectedPolicy.minWindowMinutes}m`,
      timeout: `${selectedPolicy.timeoutMinutes}s`,
    };
  }, [planCount, run, selectedPolicy, signalCount]);

  return (
    <main>
      <h1>Recovery Ops policy simulator</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label htmlFor="policy-select">Policy</label>
        <select
          id="policy-select"
          value={selectedPolicy.id}
          onChange={(event) => {
            const next = BASE_POLICIES.findIndex((entry) => entry.id === event.target.value);
            setSelectedPolicyIndex(Math.max(0, next));
          }}
        >
          {BASE_POLICIES.map((entry) => (
            <option value={entry.id} key={entry.id}>
              {entry.id}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void runOrchestratedLab()} disabled={isRunning}>
          {isRunning ? 'Simulating...' : 'Simulate policy'}
        </button>
      </div>
      <pre>{JSON.stringify(summary, undefined, 2)}</pre>
      <RecoveryOpsPolicyMatrix lab={lab} policy={selectedPolicy} selectedPlanId={selectedPlanId} />
    </main>
  );
};
