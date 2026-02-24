import { type ReactElement } from 'react';
import { useIncidentManagementWorkspace } from '../hooks/useIncidentManagementWorkspace';
import { IncidentManagementWorkspacePanel } from '../components/IncidentManagementWorkspacePanel';
import { IncidentReadinessTimeline } from '../components/IncidentReadinessTimeline';
import { IncidentReadinessScoreCard } from '../components/IncidentReadinessScoreCard';

export const IncidentManagementWorkspacePage = (): ReactElement => {
  const { state, actions } = useIncidentManagementWorkspace({ tenantId: 'tenant-ops-core' });

  return (
    <main>
      <h1>Incident Management Workspace</h1>
      <button type="button" onClick={() => void actions.refresh()}>
        Refresh workspace
      </button>
      <IncidentReadinessScoreCard summary={state.summary} />
      <IncidentManagementWorkspacePanel incidents={state.incidents} onAcknowledge={actions.acknowledge} />
      <IncidentReadinessTimeline
        title="Incident readiness trend"
        points={state.incidents.map((incident) => ({
          at: incident.updatedAt,
          score: incident.triage.severity === 'sev1' ? 95 : incident.triage.severity === 'sev2' ? 75 : 45,
        }))}
      />
      {state.loading ? <p>loading...</p> : null}
      <section>
        <h4>Alerts</h4>
        <ul>
          {state.alerts.map((alert) => (
            <li key={alert}>{alert}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
