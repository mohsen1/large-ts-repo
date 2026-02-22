import { useMemo, useState } from 'react';
import type { DashboardIncident, DashboardPlanState, DashboardRunState } from '../types';
import type { RecoveryCommand } from '../hooks/useRecoveryWorkflow';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { useRecoveryWorkflow } from '../hooks/useRecoveryWorkflow';
import { useIncidentDashboard } from '../hooks/useIncidentDashboard';

export interface CommandHistoryItem {
  readonly command: RecoveryCommand['command'];
  readonly incidentId: string;
  readonly correlationId: string;
  readonly message: string;
}

export interface IncidentCommandBoardProps {
  readonly repository: RecoveryIncidentRepository;
  readonly incidents: readonly DashboardIncident[];
  readonly plans: readonly DashboardPlanState[];
  readonly runs: readonly DashboardRunState[];
}

export const IncidentCommandBoard = ({ repository, incidents, plans, runs }: IncidentCommandBoardProps) => {
  const [history, setHistory] = useState<readonly CommandHistoryItem[]>([]);
  const [tenantId, setTenantId] = useState('default');
  const { actions } = useIncidentDashboard(repository);
  const { sendCommand, summarizeStatus } = useRecoveryWorkflow(repository);

  const commands = useMemo(
    () => [
      'plan',
      'execute',
      'promote',
      'refresh',
      'query',
    ] as const,
    [],
  );

  const emitCommand = async (incidentId: string, command: (typeof commands)[number]) => {
    const record: RecoveryCommand = {
      tenantId,
      incidentId,
      command,
      correlationId: `ui-${Date.now()}`,
      reason: `board:${command}`,
    };
    const outcome = await sendCommand(record);
    setHistory((previous) => [
      ...previous,
      {
        command,
        incidentId,
        correlationId: record.correlationId,
        message: outcome.message,
      },
    ]);
  };

  const quickPlanTargets = useMemo(() => incidents
    .map((incident) => incident.id)
    .slice(0, 3), [incidents]);

  const status = summarizeStatus(
    {
      incidents,
      plans,
      runs,
      status: 'ready',
      errors: [],
    },
    {
      incidentCount: incidents.length,
      approvedPlanCount: plans.filter((entry) => entry.approved).length,
      runningRunCount: runs.filter((run) => run.state === 'running').length,
      failedRunCount: runs.filter((run) => run.state === 'failed').length,
      recentIncidentIds: incidents.map((incident) => incident.id),
    },
  );

  return (
    <section className="incident-command-board">
      <header>
        <h2>Incident Command Board</h2>
        <p>Events={status.eventCount}, Runs={status.executedRuns}, Failed={status.failedRuns}</p>
      </header>
      <label>
        Tenant
        <input value={tenantId} onChange={(event) => setTenantId(event.currentTarget.value)} />
      </label>
      <div>
        {commands.map((command) => (
          <button
            key={command}
            onClick={() => {
              void (async () => {
                const target = quickPlanTargets.at(0);
                if (target) {
                  await emitCommand(target, command);
                }
                if (command === 'refresh') {
                  await actions.refresh();
                }
              })();
            }}
          >
            {command}
          </button>
        ))}
      </div>
      <ul className="incident-command-history">
        {history.map((entry, index) => (
          <li key={`${entry.incidentId}-${entry.correlationId}-${index}`}>
            <strong>{entry.command}</strong> {entry.incidentId}
            <em>{entry.correlationId}</em>
            <span>{entry.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
