import { useMemo } from 'react';
import type { DashboardRunState, DashboardState, DashboardIncident } from '../../types';

export interface HeatCell {
  readonly runState: DashboardRunState['state'];
  readonly runCount: number;
  readonly incidentCount: number;
}

export interface IncidentHeatmapProps {
  readonly incidents: readonly DashboardIncident[];
  readonly runs: readonly DashboardRunState[];
  readonly state: DashboardState;
  readonly onCellClick?: (state: DashboardRunState['state']) => void;
}

const buildMatrix = (runs: readonly DashboardRunState[]): HeatCell[] => {
  const grouped = {
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
  };

  for (const run of runs) {
    grouped[run.state] += 1;
  }

  const total = runs.length || 1;
  return [
    { runState: 'pending', runCount: grouped.pending, incidentCount: Math.ceil((grouped.pending / total) * 100) },
    { runState: 'running', runCount: grouped.running, incidentCount: Math.ceil((grouped.running / total) * 100) },
    { runState: 'done', runCount: grouped.done, incidentCount: Math.ceil((grouped.done / total) * 100) },
    { runState: 'failed', runCount: grouped.failed, incidentCount: Math.ceil((grouped.failed / total) * 100) },
  ];
};

export const IncidentHeatmap = ({ incidents, runs, state, onCellClick }: IncidentHeatmapProps) => {
  const matrix = useMemo(() => buildMatrix(runs), [runs]);

  const totalSeverity = useMemo(() => {
    const scoreBySeverity = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      extreme: 0,
    } as Record<DashboardIncident['severity'], number>;

    for (const incident of incidents) {
      scoreBySeverity[incident.severity] += 1;
    }
    return scoreBySeverity;
  }, [incidents]);

  const topIncidents = useMemo(() => {
    return incidents
      .slice()
      .sort((left, right) => right.severity.localeCompare(left.severity))
      .slice(0, 3);
  }, [incidents]);

  return (
    <section className="incident-heatmap">
      <h2>Incident Heatmap</h2>
      <p>State records: {state.status} / {runs.length}</p>
      <div className="heat-grid">
        {matrix.map((cell) => (
          <button
            key={cell.runState}
            className={`heat-cell state-${cell.runState}`}
            onClick={() => onCellClick?.(cell.runState)}
            title={`state=${cell.runState}`}
          >
            <strong>{cell.runState}</strong>
            <span>Runs: {cell.runCount}</span>
            <span>Incidents: {cell.incidentCount}%</span>
          </button>
        ))}
      </div>
      <div className="severity-summary">
        {Object.entries(totalSeverity).map(([severity, count]) => (
          <p key={severity}>
            {severity}: {count}
          </p>
        ))}
      </div>
      <div className="top-incidents">
        <h3>Top incidents</h3>
        <ul>
          {topIncidents.map((incident) => (
            <li key={String(incident.id)}>
              <strong>{incident.title}</strong> {incident.severity}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
