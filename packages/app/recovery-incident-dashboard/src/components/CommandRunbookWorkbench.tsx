import { useMemo } from 'react';
import type { IncidentId } from '@domain/recovery-incident-orchestration';
import type { CommandWorkspaceState } from '../hooks/useIncidentCommandWorkspace';
import type { CommandOrchestratorReport } from '@service/recovery-command-orchestrator';

interface CommandRunbookWorkbenchProps {
  readonly state: CommandWorkspaceState;
  readonly operator: string;
  readonly onSelectIncident: (incidentId: IncidentId) => void;
  readonly onPrepare: () => void;
  readonly onExecute: () => Promise<void> | void;
}

export const CommandRunbookWorkbench = ({
  state,
  operator,
  onSelectIncident,
  onPrepare,
  onExecute,
}: CommandRunbookWorkbenchProps) => {
  const incidents = useMemo(
    () =>
      state.incidents.map((incident) => ({
        ...incident,
        isSelected: state.selectedIncidentId === incident.id,
      })),
    [state.incidents, state.selectedIncidentId],
  );

  return (
    <section className="command-workbench">
      <header>
        <h2>Incident Command Workbench</h2>
        <p>
          Operator: <strong>{operator}</strong> • Status: <strong>{state.status}</strong>
        </p>
        <p>{state.statusLine}</p>
      </header>

      <div className="incident-grid">
        {incidents.map((incident) => (
          <article
            key={String(incident.id)}
            className={incident.isSelected ? 'selected' : ''}
            style={{ padding: '0.5rem', border: '1px solid #ddd', marginBottom: '0.5rem' }}
            onClick={() => onSelectIncident(incident.id)}
            role="button"
          >
            <h3>{incident.title}</h3>
            <p>scope={incident.scope.serviceName}</p>
            <p>severity={incident.severity} runs={incident.runCount}</p>
            <p>lastSeen={incident.lastSeenAt}</p>
          </article>
        ))}
      </div>

      <div className="runbook-actions">
        <button type="button" onClick={onPrepare}>
          Build simulation
        </button>
        <button type="button" onClick={() => void onExecute()}>
          Execute runbook
        </button>
      </div>

      {state.prepared ? (
        <article>
          <h3>Prepared runbook</h3>
          <p>commands: {state.prepared.runbook.playbook.commands.length}</p>
          <p>parallelism: {state.prepared.simulation.parallelism}</p>
          <p>expected finish: {state.prepared.simulation.expectedFinishAt}</p>
          <p>violations: {state.prepared.simulation.violations.length}</p>
          <ol>
            {state.prepared.simulation.violations.map((violation) => (
              <li key={`${violation.commandId}-${violation.reason}`}>
                {violation.commandId}: {violation.reason}
              </li>
            ))}
          </ol>
        </article>
      ) : null}

      {state.report ? <RunbookExecutionReport report={state.report} /> : null}
    </section>
  );
};

const RunbookExecutionReport = ({ report }: { report: CommandOrchestratorReport }) => {
  return (
    <section>
      <h3>Execution report</h3>
      <p>
        runbook={report.runbookId} frames={report.frameCount}
      </p>
      <p>runs={report.executedRuns}</p>
      <p>plannedMinutes={report.plannedMinutes}</p>
      <ul>
        {report.logs.slice(0, 8).map((entry) => (
          <li key={entry.id}>
            {entry.at} {entry.state} {entry.message}
          </li>
        ))}
      </ul>
    </section>
  );
};
