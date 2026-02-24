import { useMemo, useState } from 'react';

import type { ConstellationPlanCardProps } from '../types';
import { useRecoveryCommandConstellation } from '../hooks/useRecoveryCommandConstellation';
import { ConstellationBoard } from '../components/ConstellationBoard';
import { ConstellationTimeline } from '../components/ConstellationTimeline';
import { ConstellationPolicyHeatmap } from '../components/ConstellationPolicyHeatmap';

interface RecoveryCommandConstellationPageProps {
  readonly tenant?: string;
  readonly plans: readonly ConstellationPlanCardProps[];
}

export const RecoveryCommandConstellationPage = ({ tenant = 'tenant:global', plans }: RecoveryCommandConstellationPageProps) => {
  const [planId, setPlanId] = useState<string>(plans[0]?.plan.id ?? '');
  const selectedPlan = plans.find((candidate) => candidate.plan.id === planId) ?? plans[0];

  const state = useRecoveryCommandConstellation(selectedPlan?.plan ?? plans[0]?.plan);
  const insightPoints = useMemo(() => state.insights, [state.insights]);
  const hasPlan = Boolean(selectedPlan);

  return (
    <main className="recovery-command-constellation-page">
      <h1>{tenant} Constellation Orchestrator</h1>
      <p>Mode: {state.panelState.mode}</p>
      {plans.length === 0 ? (
        <p>No plans available.</p>
      ) : (
        <>
          <ConstellationBoard state={state} plans={plans} onOpen={setPlanId} />
          {hasPlan ? (
            <>
              <p>Selected: {planId}</p>
              <p>{state.summary?.title}</p>
              <ConstellationTimeline state={state} timeline={state.summary?.timeline ?? []} />
              <ConstellationPolicyHeatmap title={state.summary?.title ?? 'Policy Heatmap'} insights={insightPoints} />
              <section>
                <h2>Run Trace</h2>
                <pre>{JSON.stringify(state.trace, null, 2)}</pre>
              </section>
            </>
          ) : (
            <p>Waiting for selected plan.</p>
          )}
        </>
      )}
      <footer>
        <button type="button" onClick={state.reload}>
          Refresh
        </button>
      </footer>
    </main>
  );
};
