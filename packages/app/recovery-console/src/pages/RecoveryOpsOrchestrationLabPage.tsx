import { useCallback } from 'react';
import { useRecoveryOpsOrchestrationLab } from '../hooks/useRecoveryOpsOrchestrationLab';
import { RecoveryOpsOrchestrationLabPanel } from '../components/RecoveryOpsOrchestrationLabPanel';
import { RecoveryOpsLabTimeline } from '../components/RecoveryOpsLabTimeline';
import { RecoveryOpsPolicyMatrix } from '../components/RecoveryOpsPolicyMatrix';
import type { OrchestrationPolicy } from '@domain/recovery-ops-orchestration-lab';

const policy: OrchestrationPolicy = {
  id: 'policy-orchestration-default' as OrchestrationPolicy['id'],
  tenantId: 'tenant-global',
  maxParallelSteps: 4,
  minConfidence: 0.6,
  allowedTiers: ['signal', 'warning', 'critical'],
  minWindowMinutes: 10,
  timeoutMinutes: 180,
};

export const RecoveryOpsOrchestrationLabPage = () => {
  const { lab, run, isRunning, lastError, signalCount, planCount, graphSummary, runOrchestratedLab } =
    useRecoveryOpsOrchestrationLab({
      tenant: 'tenant-global',
      policy,
    });

  const handleRun = useCallback(() => {
    void runOrchestratedLab();
  }, [runOrchestratedLab]);

  return (
    <main>
      <h1>Recovery ops orchestration lab</h1>
      <p>{`policy=${policy.id}`}</p>
      <p>{`signals=${signalCount} plans=${planCount}`}</p>
      <p>{graphSummary}</p>
      <button type="button" onClick={handleRun} disabled={isRunning}>
        {isRunning ? 'Running...' : 'Run orchestration'}
      </button>
      {lastError ? <p style={{ color: 'red' }}>{lastError}</p> : null}
      <RecoveryOpsOrchestrationLabPanel
        lab={lab}
        policy={policy}
        runSummary={run ? run.envelope.id : undefined}
      />
      <RecoveryOpsPolicyMatrix
        lab={lab}
        policy={policy}
        selectedPlanId={run?.commandResult.chosenPlanId}
      />
      <RecoveryOpsLabTimeline lab={lab} run={run} />
    </main>
  );
};
