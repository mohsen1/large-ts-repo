import { useState } from 'react';
import { RecoveryCommandControlHubHeader } from '../components/RecoveryCommandControlHubHeader';
import { RecoveryCommandControlHubDashboard } from '../components/RecoveryCommandControlHubDashboard';
import { RecoveryCommandControlHubTimeline } from '../components/RecoveryCommandControlHubTimeline';
import { useRecoveryCommandControlHub } from '../hooks/useRecoveryCommandControlHub';

interface RecoveryCommandControlHubPageProps {
  readonly tenant: string;
}

export const RecoveryCommandControlHubPage = ({ tenant }: RecoveryCommandControlHubPageProps) => {
  const [tenantValue, setTenantValue] = useState(tenant);
  const {
    state,
    draftSummary,
    draftInsights,
    startHub,
    setFilter,
    resetDraft,
  } = useRecoveryCommandControlHub(tenantValue);

  return (
    <main>
      <RecoveryCommandControlHubHeader
        tenant={tenantValue}
        notes={state.notes}
        filter={state.filter}
        onFilterChange={(next) => {
          setTenantValue(next.tenant);
          setFilter(next);
        }}
      />

      <p>{`draft recommended wait=${draftInsights.recommendedWaitMs}ms`}</p>
      <p>{`action=${draftInsights.action}`}</p>

      <section>
        <button onClick={startHub} disabled={state.inFlight} type="button">
          {state.inFlight ? 'Starting…' : 'Start Orchestration'}
        </button>
        <button onClick={resetDraft} type="button">
          Reset Draft
        </button>
      </section>

      <RecoveryCommandControlHubDashboard
        tenant={tenantValue}
        runId={state.runId}
        execution={state.execution}
        draft={draftSummary}
      />

      <RecoveryCommandControlHubTimeline execution={state.execution} />

      <section>
        <h3>Node Order</h3>
        <ul>
          {draftSummary.topology.nodeIds.map((nodeId, index) => (
            <li key={String(nodeId)}>{`${index + 1}. ${nodeId}`}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
