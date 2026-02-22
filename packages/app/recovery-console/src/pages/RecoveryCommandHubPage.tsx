import { IncidentCommandHubDashboard } from '../components/IncidentCommandHubDashboard';
import { IncidentCommandCadenceBoard } from '../components/IncidentCommandCadenceBoard';
import { useRecoveryCommandHub } from '../hooks/useRecoveryCommandHub';
import { useRecoveryCommandHubPageState } from '../hooks/useRecoveryCommandHubPageState';
import { useRecoveryCommandCadence } from '../hooks/useRecoveryCommandCadence';
import { buildRecoveryCommandOrchestrator, isCommandClosable } from '@service/recovery-operations-engine/command-hub-orchestrator';
import { buildCadencePlan } from '@domain/recovery-operations-models/control-plane-cadence';
import { withBrand } from '@shared/core';
import { useMemo } from 'react';

export const RecoveryCommandHubPage = () => {
  const hub = useRecoveryCommandHub();
  const cadenceHook = useRecoveryCommandCadence();
  const pageState = useRecoveryCommandHubPageState();
  const orchestrator = useMemo(() => buildRecoveryCommandOrchestrator(), []);

  const cadences = useMemo(() => {
    return Object.values(pageState.state.artifactMap).map((artifact) => {
      return buildCadencePlan(
        withBrand(String(artifact.tenant), 'TenantId'),
        withBrand(String(artifact.artifact.commandId), 'CommandArtifactId'),
        4,
      );
    });
  }, [pageState.state.artifactMap]);

  const onClose = async () => {
    if (!pageState.state.selectedArtifactId) {
      return;
    }
    await isCommandClosable(orchestrator, pageState.state.selectedArtifactId);
  };

  const selectedIdLabel = pageState.state.selectedArtifactId ?? 'none';

  return (
    <main className="recovery-command-hub-page">
      <h1>Recovery Command Hub</h1>
      <p>Selected command: {selectedIdLabel}</p>
      <IncidentCommandHubDashboard initialTenant={hub.state.tenant} />
      <IncidentCommandCadenceBoard
        plans={cadences}
        selectedCommandId={pageState.state.selectedArtifactId}
        onSelect={pageState.setSelectedArtifactId}
      />
      {hub.state.summary ? (
        <section>
          <h2>Summary snapshot</h2>
          <dl>
            <dt>Artifacts</dt>
            <dd>{hub.state.summary.totalArtifacts}</dd>
            <dt>Near breach cadence</dt>
            <dd>{hub.state.summary.nearBreachCadenceCount}</dd>
            <dt>Critical windows</dt>
            <dd>{hub.state.summary.criticalWindowCount}</dd>
            <dt>Average score</dt>
            <dd>{hub.state.summary.avgForecastScore.toFixed(3)}</dd>
          </dl>
          <button type="button" onClick={onClose}>
            Verify closure state
          </button>
        </section>
      ) : null}
      <section>
        <h2>Signals</h2>
        <div className="signal-grid">
          {pageState.state.artifactTitles.map((title) => (
            <span key={title}>{title}</span>
          ))}
        </div>
        <div>{pageState.state.isLoaded ? 'ready' : 'loading'}</div>
      </section>
      <section>
        <button type="button" onClick={() => void cadenceHook.refresh()}>
          Refresh cadence hooks
        </button>
      </section>
    </main>
  );
};
