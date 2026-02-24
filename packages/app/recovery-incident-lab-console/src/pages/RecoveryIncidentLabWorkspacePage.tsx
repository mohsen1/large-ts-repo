import { type ReactElement } from 'react';
import { ScenarioLabTimeline } from '../components/ScenarioLabTimeline';
import { ScenarioLabTopologyView } from '../components/ScenarioLabTopologyView';
import { ScenarioLabGovernancePanel } from '../components/ScenarioLabGovernancePanel';
import { ScenarioLabForecastPanel } from '../components/ScenarioLabForecastPanel';
import { useRecoveryIncidentLabWorkspace } from '../hooks/useRecoveryIncidentLabWorkspace';

export const RecoveryIncidentLabWorkspacePage = (): ReactElement => {
  const { state, plan, statusText } = useRecoveryIncidentLabWorkspace();

  return (
    <main className="recovery-incident-lab-workspace-page">
      <header>
        <h1>Recovery Incident Lab Workspace</h1>
        <p>{statusText}</p>
      </header>
      <ScenarioLabTopologyView scenario={state.scenario} selectedSteps={state.output?.plan?.queue ?? []} />
      <ScenarioLabForecastPanel scenario={state.scenario} />
      <ScenarioLabGovernancePanel output={state.output} title="Workspace governance" />
      <ScenarioLabTimeline run={state.output?.run} />
      <section>
        <h2>Plan info</h2>
        <p>plan id: {plan ? plan.id : 'none'}</p>
        <p>queue length: {plan ? plan.queue.length : 0}</p>
      </section>
    </main>
  );
};
