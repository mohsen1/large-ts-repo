import { useMemo } from 'react';
import type { DashboardIncident, DashboardPlanState, DashboardRunState } from '../types';
import type { IncidentId, IncidentPlan } from '@domain/recovery-incident-orchestration';

export interface IncidentBoardProps {
  incidents: readonly DashboardIncident[];
  plans: readonly DashboardPlanState[];
  runs: readonly DashboardRunState[];
  onExecute: (incidentId: IncidentId) => void;
  onApprove: (planId: IncidentPlan['id']) => void;
}

export const IncidentBoard = ({ incidents, plans, runs, onExecute, onApprove }: IncidentBoardProps) => {
  const entries = useMemo(() => incidents.map((incident) => {
    const plan = plans.find((candidate) => candidate.incidentId === incident.id);
    const runCount = plan ? runs.filter((run) => run.planId === plan.planId).length : 0;
    const failedRuns = plan ? runs.filter((run) => run.planId === plan.planId && run.state === 'failed').length : 0;

    return (
      <li key={incident.id} className="incident-board-row">
        <section>
          <h3>{incident.title}</h3>
          <p>{incident.summary}</p>
        </section>
        <section>
          <strong>Severity:</strong> {incident.severity}
          <span>Runs: {runCount}</span>
          <span>Failed: {failedRuns}</span>
        </section>
        {plan ? (
          <section>
            <strong>{plan.title}</strong>
            <span>Status: {plan.approved ? 'approved' : 'pending'}</span>
            <button onClick={() => onApprove(plan.planId)} disabled={plan.approved}>
              Approve
            </button>
            <button onClick={() => onExecute(incident.id)}>Execute</button>
          </section>
        ) : (
          <section>No active plan</section>
        )}
      </li>
    );
  }), [incidents, plans, runs, onApprove, onExecute]);

  return <ul className="incident-board-list">{entries}</ul>;
};

export const boardClass = 'recovery-incident-board';
