import { useMemo } from 'react';
import type { DashboardIncident } from '../types';
import { useRecoveryWorkflow, type RecoveryCommand } from '../hooks/useRecoveryWorkflow';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';

interface RecoveryCommandCenterProps {
  readonly incidents: readonly DashboardIncident[];
  readonly repository: RecoveryIncidentRepository;
  readonly tenantId: string;
  readonly onQueued: (runId: string) => void;
}

export const RecoveryCommandCenter = ({ incidents, repository, tenantId, onQueued }: RecoveryCommandCenterProps) => {
  const { sendCommand, summarizeStatus, summary } = useRecoveryWorkflow(repository);

  const options = useMemo(
    () => incidents.slice(0, 6).map((incident) => ({ value: String(incident.id), label: incident.title })),
    [incidents],
  );

  const execute = async (incidentId: string, command: RecoveryCommand['command']) => {
    const action: RecoveryCommand = {
      tenantId,
      incidentId,
      command,
      correlationId: `cc-${Date.now()}`,
      reason: command === 'promote' ? 'operator-approved' : 'automated',
    };
    const result = await sendCommand(action);
    if (result.status === 'queued' || result.status === 'accepted' || result.status === 'done') {
      onQueued(`incident:${action.incidentId}:${action.command}`);
    }
  };

  return (
    <section className="recovery-command-center">
      <header>
        <h2>Incident Command Center</h2>
        <p>Events: {summary.eventCount}, running: {String(summary.running)}</p>
      </header>
      <ul className="recovery-command-options">
        {options.map((option) => (
          <li key={option.value}>
            <strong>{option.label}</strong>
            <div className="recovery-command-actions">
              <button onClick={() => void execute(option.value, 'plan')}>Plan</button>
              <button onClick={() => void execute(option.value, 'execute')}>Execute</button>
              <button onClick={() => void execute(option.value, 'promote')}>Promote</button>
              <button onClick={() => void execute(option.value, 'refresh')}>Refresh</button>
              <button onClick={() => void execute(option.value, 'query')}>Query</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
