import { useMemo } from 'react';
import { RecoveryCommandCenter } from '../components/RecoveryCommandCenter';
import { RecoveryRiskOverview } from '../components/RecoveryRiskOverview';
import { RecoveryTimeline } from '../components/RecoveryTimeline';
import { useIncidentDashboard, summarizeState } from '../hooks/useIncidentDashboard';
import { useRecoveryWorkflow } from '../hooks/useRecoveryWorkflow';
import type { DashboardRunState } from '../types';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { OperationsControllerPanel } from '../components/OperationsControllerPanel';
import { OperationsPlaybookBoard } from '../components/OperationsPlaybookBoard';

export const OperationsPage = ({ repository, tenantId }: { repository: RecoveryIncidentRepository; tenantId: string }) => {
  const { state, actions } = useIncidentDashboard(repository);
  const { summarizeStatus } = useRecoveryWorkflow(repository);

  const running = useMemo<DashboardRunState[]>(
    () => state.runs.filter((run) => run.state === 'running' || run.state === 'pending'),
    [state.runs],
  );
  const failed = useMemo<DashboardRunState[]>(() => state.runs.filter((run) => run.state === 'failed'), [state.runs]);

  const summary = summarizeState(state);
  const workflowSummary = summarizeStatus(state, {
    incidentCount: state.incidents.length,
    approvedPlanCount: state.plans.filter((plan) => plan.approved).length,
    runningRunCount: state.runs.filter((run) => run.state === 'running').length,
    failedRunCount: state.runs.filter((run) => run.state === 'failed').length,
    recentIncidentIds: state.incidents.map((incident) => incident.id),
  });

  const planIncidentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const plan of state.plans) {
      map.set(String(plan.planId), String(plan.incidentId));
    }
    return map;
  }, [state.plans]);

  return (
    <main className="operations-page">
      <header>
        <h1>Recovery Operations Center</h1>
        <p>{summary}</p>
        <p>Severity score: {workflowSummary.severityScore}</p>
        <button onClick={() => void actions.refresh()}>Refresh</button>
      </header>

      <section>
        <RecoveryCommandCenter
          incidents={state.incidents}
          repository={repository}
          tenantId={tenantId}
          onQueued={(runId) => {
            console.log(`queued ${runId}`);
          }}
        />
      </section>

      <section>
        <h2>Operational Heat</h2>
        <RecoveryRiskOverview title="Current risk matrix" runs={state.runs} />
      </section>

      <section>
        <OperationsControllerPanel repository={repository} tenantId={tenantId} />
      </section>

      <section>
        <OperationsPlaybookBoard
          repository={repository}
          tenantId={tenantId}
          incidents={state.incidents}
          runs={running}
        />
      </section>

      <section>
        <h2>In-flight runs</h2>
        <RecoveryTimeline
          runs={running}
          onSelect={(runId) => {
            const incidentId = state.plans.find((plan) => String(plan.planId).startsWith(runId.split(':')[0]))?.incidentId;
            if (incidentId) {
              void actions.execute(incidentId);
            }
          }}
        />
      </section>

      <section>
        <h2>Failed runs</h2>
        <RecoveryTimeline
          runs={failed}
          onSelect={() => {
            void actions.refresh();
          }}
        />
      </section>
    </main>
  );
};
