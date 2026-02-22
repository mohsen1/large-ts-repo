import { useMemo, useState } from 'react';
import { IncidentBoard } from '../components/IncidentBoard';
import { IncidentCommandBoard } from '../components/IncidentCommandBoard';
import { IncidentFilters, applyIncidentFilters } from '../components/IncidentFilters';
import { RecoveryRiskOverview } from '../components/RecoveryRiskOverview';
import { RecoveryTimeline } from '../components/RecoveryTimeline';
import { useIncidentDashboard, summarizeState, flattenForView } from '../hooks/useIncidentDashboard';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { buildIncidentTrend } from '@service/recovery-incident-orchestrator';
import { buildStoreAnalytics } from '@data/recovery-incident-store';
import type { IncidentStoreState } from '@data/recovery-incident-store';

export interface ControlCenterPageProps {
  readonly repository: RecoveryIncidentRepository;
}

export const ControlCenterPage = ({ repository }: ControlCenterPageProps) => {
  const { state, actions } = useIncidentDashboard(repository);
  const [filters, setFilters] = useState({
    tenantId: '',
    serviceName: '',
    severity: '',
    hasPlans: false,
    query: '',
  });

  const filteredIncidents = useMemo(
    () => applyIncidentFilters(state.incidents, filters),
    [state.incidents, filters],
  );
  const filteredRows = useMemo(
    () => flattenForView(filteredIncidents, state.plans),
    [filteredIncidents, state.plans],
  );

  const runningRuns = useMemo(() => state.runs.filter((run) => run.state === 'running'), [state.runs]);
  const failedRuns = useMemo(() => state.runs.filter((run) => run.state === 'failed'), [state.runs]);

  const topRiskTenants = useMemo(() => {
    const planRows = state.plans.map((entry) => ({
      incidentId: entry.incidentId,
      runCount: entry.runCount,
      approved: entry.approved,
    }));
    return [...planRows].sort((left, right) => right.runCount - left.runCount).slice(0, 3);
  }, [state.plans]);

  const analytics = useMemo(() => {
    const snapshot: IncidentStoreState = state.incidents.length > 0
      ? {
          incidents: state.incidents.map((incident) => ({
            id: incident.id,
            version: 1,
            label: incident.title,
            incident,
          })),
          plans: [],
          runs: [],
          events: [],
        }
      : {
          incidents: [],
          plans: [],
          runs: [],
          events: [],
        };

    return buildStoreAnalytics(snapshot);
  }, [state.incidents]);

  const trends = useMemo(() => buildIncidentTrend({
    data: filteredIncidents,
    total: filteredIncidents.length,
  }), [filteredIncidents]);

  return (
    <main className="control-center-page">
      <header>
        <h1>Incident Control Center</h1>
        <p>{summarizeState(state)}</p>
        <button onClick={() => void actions.refresh()}>Refresh All</button>
      </header>

      <section>
        <h2>Filters</h2>
        <IncidentFilters incidents={state.incidents} value={filters} onChange={setFilters} />
      </section>

      <section>
        <h2>Incident Snapshot</h2>
        <p>Visible incidents: {filteredIncidents.length}</p>
        <IncidentBoard
          incidents={filteredIncidents}
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
        <h2>Operations</h2>
        <IncidentCommandBoard
          repository={repository}
          incidents={filteredIncidents}
          plans={state.plans}
          runs={state.runs}
        />
      </section>

      <section>
        <h2>Tenant pressure</h2>
        <ul>
          {trends.map((trend: { key: string; total: number; escalationCount: number }) => (
            <li key={trend.key}>
              {trend.key}: {trend.total} incidents, {trend.escalationCount} escalations
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Risk Snapshot</h2>
        <RecoveryRiskOverview title="Control risk by run state" runs={state.runs} />
        <ul>
          {topRiskTenants.map((row) => (
            <li key={String(row.incidentId)}>
              {row.incidentId}: runs={row.runCount}, approved={String(row.approved)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Timeline</h2>
        <RecoveryTimeline runs={runningRuns} onSelect={() => {}} />
        <RecoveryTimeline runs={failedRuns} onSelect={() => {}} />
      </section>

      <section>
        <h2>Health</h2>
        <p>Event classes: {Object.keys(analytics.eventDistribution).length}</p>
        <p>Rows in filter: {filteredRows.length}</p>
      </section>
    </main>
  );
};
