import { useMemo } from 'react';
import { usePolicyConsoleWorkspace } from '../hooks/usePolicyConsoleWorkspace';
import { PolicyPluginRegistryPanel } from '../components/PolicyPluginRegistryPanel';
import { PolicyPluginLogTimeline } from '../components/PolicyPluginLogTimeline';
import { PolicyRunCards } from '../components/PolicyRunCards';

export const PolicyConsoleOpsPage = () => {
  const { state } = usePolicyConsoleWorkspace();
  const totalArtifacts = state.artifacts.length;
  const activeArtifacts = useMemo(
    () => state.artifacts.filter((artifact) => artifact.state === 'active').length,
    [state.artifacts],
  );

  return (
    <section>
      <h1>Policy Console Operations</h1>
      <p>
        Orchestrator: {state.orchestratorId ?? 'unknown'} |
        artifacts={totalArtifacts} active={activeArtifacts}
      </p>
      <p>selectedArtifacts={state.selectedArtifactIds.join(', ')}</p>
      <div>
        <PolicyPluginRegistryPanel namespace="telemetry" seed={state.lastPluginEnvelope} />
        <PolicyRunCards orchestratorId={state.orchestratorId ?? 'default'} />
        <PolicyPluginLogTimeline envelope={state.lastPluginEnvelope} />
      </div>
    </section>
  );
};
