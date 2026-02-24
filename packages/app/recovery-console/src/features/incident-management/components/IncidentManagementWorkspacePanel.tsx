import type { ReactElement } from 'react';
import type { IncidentRecord } from '@domain/incident-management';

interface IncidentManagementWorkspacePanelProps {
  readonly incidents: readonly IncidentRecord[];
  readonly onAcknowledge: (id: string) => void;
}

export const IncidentManagementWorkspacePanel = ({
  incidents,
  onAcknowledge,
}: IncidentManagementWorkspacePanelProps): ReactElement => {
  return (
    <section>
      <h2>Incident Workspace</h2>
      <ul>
        {incidents.map((incident) => (
          <li key={incident.id}>
            <strong>{incident.title}</strong>
            <span>{` [${incident.state}]`}</span>
            <p>{incident.details}</p>
            <p>{`Severity: ${incident.triage.severity}`}</p>
            <button type="button" onClick={() => onAcknowledge(incident.id)}>
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
      {incidents.length === 0 ? <p>No incidents for this workspace</p> : null}
    </section>
  );
};
