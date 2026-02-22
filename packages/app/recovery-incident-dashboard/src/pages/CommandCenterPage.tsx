import { useMemo } from 'react';
import { useIncidentDashboard } from '../hooks/useIncidentDashboard';
import { useIncidentCommandWorkspace } from '../hooks/useIncidentCommandWorkspace';
import { CommandRunbookWorkbench } from '../components/CommandRunbookWorkbench';
import { CommandReadinessTicker } from '../components/CommandReadinessTicker';
import { DecisionPriorityMatrix } from '../components/DecisionPriorityMatrix';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';

export interface CommandCenterPageProps {
  readonly repository: RecoveryIncidentRepository;
}

export const CommandCenterPage = ({ repository }: CommandCenterPageProps) => {
  const { state: dashboardState, summary } = useIncidentDashboard(repository);
  const { state, actions } = useIncidentCommandWorkspace(repository, {
    tenantId: 'tenant-ops',
    operator: 'control-room',
  });

  const heartbeat = useMemo(() => {
    const total = dashboardState.runs.length + state.incidents.length + state.errors.length;
    const now = Date.now();
    return total === 0 ? now % 90 : now % 90 + total;
  }, [dashboardState.runs.length, state.incidents.length, state.errors.length]);

  return (
    <main className="command-center-page">
      <header>
        <h1>Recovery Command Center</h1>
        <p>Cross-package orchestration workspace for incident-level playbooks.</p>
      </header>

      <section className="control-row">
        <CommandReadinessTicker summary={summary} heartbeat={heartbeat} />
        <DecisionPriorityMatrix summary={summary} labels={['SLO', 'RTO', 'RPO']} />
      </section>

      <section>
        <CommandRunbookWorkbench
          state={state}
          operator="control-room"
          onSelectIncident={(incidentId) => {
            void actions.selectIncident(incidentId);
          }}
          onPrepare={() => {
            void actions.prepare();
          }}
          onExecute={() => actions.execute()}
        />
      </section>

      {state.errors.length > 0 ? (
        <section>
          <h3>Errors</h3>
          <ul>
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
};
