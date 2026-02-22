import type { DashboardSummary } from '../hooks/useIncidentDashboard';

interface DecisionPriorityMatrixProps {
  readonly summary: DashboardSummary;
  readonly labels?: readonly string[];
}

const computeCell = (value: number) => {
  if (value > 10) {
    return 'critical';
  }
  if (value > 5) {
    return 'warning';
  }
  return 'ok';
}

export const DecisionPriorityMatrix = ({
  summary,
  labels,
}: DecisionPriorityMatrixProps) => {
  const cells = [
    { name: 'Incidents', score: summary.incidentCount, weight: 1.1 },
    { name: 'Approved plans', score: summary.approvedPlanCount, weight: 2.2 },
    { name: 'Running', score: summary.runningRunCount, weight: 1.3 },
    { name: 'Failed', score: summary.failedRunCount, weight: 0.9 },
  ].map((entry) => ({
    ...entry,
    weighted: entry.score * entry.weight,
    state: computeCell(entry.score * entry.weight),
  }));

  const total = cells.reduce((sum, cell) => sum + cell.weighted, 0);

  return (
    <section className="decision-matrix">
      <h3>Decision priority</h3>
      <p>labels={labels?.length ? labels.join(',') : 'default'}</p>
      <p>Total weighted score: {total.toFixed(1)}</p>
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Score</th>
            <th>Weight</th>
            <th>Weighted</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <tr key={cell.name}>
              <td>{cell.name}</td>
              <td>{cell.score}</td>
              <td>{cell.weight}</td>
              <td>{cell.weighted.toFixed(1)}</td>
              <td>{cell.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
