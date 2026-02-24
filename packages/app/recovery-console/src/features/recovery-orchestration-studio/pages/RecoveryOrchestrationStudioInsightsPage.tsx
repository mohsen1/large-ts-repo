import { useMemo } from 'react';
import { useRecoveryOrchestrationStudio } from '../hooks/useRecoveryOrchestrationStudio';
import { RunbookWorkloadPanel } from '../components/RunbookWorkloadPanel';
import { PolicyTimeline } from '../components/PolicyTimeline';
import { PluginRegistryPanel } from '../components/PluginRegistryPanel';
import { TopologyDigestCard } from '../components/TopologyDigestCard';

interface RecoveryOrchestrationStudioInsightsPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

export const RecoveryOrchestrationStudioInsightsPage = ({
  tenant,
  workspace,
}: RecoveryOrchestrationStudioInsightsPageProps) => {
  const { state, refresh } = useRecoveryOrchestrationStudio({
    tenant,
    workspace,
  });
  const topPlugins = useMemo(() => state.ticks.slice(0, 5), [state.ticks]);
  return (
    <main>
      <h1>Studio Insights</h1>
      <p>{`tenant=${tenant} workspace=${workspace}`}</p>
      <p>{`loaded=${state.loaded}`}</p>
      <p>{`ticks=${state.ticks.length}`}</p>
      <button onClick={refresh} type="button">
        Refresh metrics
      </button>
      {state.runbook ? <TopologyDigestCard runbook={state.runbook} /> : <p>waiting runbook</p>}
      <PolicyTimeline result={undefined} ticks={topPlugins} />
      <PluginRegistryPanel ticks={state.ticks} />
      <RunbookWorkloadPanel result={state.summary ? undefined : undefined} ticks={state.ticks} />
    </main>
  );
};
