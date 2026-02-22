import { useMemo } from 'react';
import { IncidentBoard } from '../components/IncidentBoard';
import { RecoveryTimeline } from '../components/RecoveryTimeline';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { useIncidentDashboard, summarizeState, flattenForView, filterRunsByState } from '../hooks/useIncidentDashboard';
import type { DashboardRunState } from '../types';

export const DashboardPage = ({ repository }: { repository: RecoveryIncidentRepository }) => {
  const { state, actions, summary } = useIncidentDashboard(repository);
  const rows = flattenForView(state.incidents, state.plans);

  const runningRuns = useMemo<DashboardRunState[]>(() => filterRunsByState(state.runs, 'running'), [state.runs]);
  const failedRuns = useMemo<DashboardRunState[]>(() => filterRunsByState(state.runs, 'failed'), [state.runs]);

  return (
    <main className="dashboard-page">
      <header>
        <h1>Recovery Incident Dashboard</h1>
        <button onClick={() => void actions.refresh()}>Refresh</button>
        <p>{summarizeState(state)}</p>
      </header>
      <section className="kpi-grid">
        <article>
          <h2>Incidents</h2>
          <strong>{summary.incidentCount}</strong>
        </article>
        <article>
          <h2>Approved Plans</h2>
          <strong>{summary.approvedPlanCount}</strong>
        </article>
        <article>
          <h2>Running Runs</h2>
          <strong>{summary.runningRunCount}</strong>
        </article>
        <article>
          <h2>Failed Runs</h2>
          <strong>{summary.failedRunCount}</strong>
        </article>
      </section>
      <section>
        <h2>Incident Board</h2>
        <IncidentBoard
          incidents={state.incidents}
          plans={state.plans}
          runs={state.runs}
          onExecute={(incidentId) => {
            void actions.execute(incidentId);
          }}
          onApprove={(planId) => {
            void actions.promote(planId);
          }}
        />
      </section>
      <section>
        <h2>Timeline</h2>
        <div>
          <h3>Running ({runningRuns.length})</h3>
          <RecoveryTimeline
            runs={runningRuns}
            onSelect={() => {
              return;
            }}
          />
          <h3>Failed ({failedRuns.length})</h3>
          <RecoveryTimeline
            runs={failedRuns}
            onSelect={() => {
              return;
            }}
          />
        </div>
      </section>
      <footer>
        <small>Rows: {rows.length}</small>
      </footer>
    </main>
  );
};
