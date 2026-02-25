import { useMemo } from 'react';
import type { OrchestrationSuiteRunOutput } from '../../services/orchestrationSuiteService';

interface PolicyDeckPanelProps {
  readonly outputs: readonly OrchestrationSuiteRunOutput[];
}

interface PolicyRow {
  readonly seed: string;
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly score: number;
  readonly events: number;
}

const buildRows = (outputs: readonly OrchestrationSuiteRunOutput[]): PolicyRow[] => {
  const rows: PolicyRow[] = [];
  for (const output of outputs) {
    const tenant = output.result.summary.tenant;
    const workspace = output.result.summary.workspace;
    const scenario = output.result.summary.scenario;
    rows.push({
      seed: output.seed,
      tenant,
      workspace,
      scenario,
      score: output.result.summary.score,
      events: output.result.summary.eventCount,
    });
  }
  return rows.toSorted((left, right) => right.score - left.score);
};

export const PolicyDeckPanel = ({ outputs }: PolicyDeckPanelProps): React.JSX.Element => {
  const rows = useMemo(() => buildRows(outputs), [outputs]);
  const topScore = useMemo(() => rows[0]?.score ?? 0, [rows]);
  const meanEvents = useMemo(() => {
    if (rows.length === 0) {
      return 0;
    }
    return rows.reduce((acc, row) => acc + row.events, 0) / rows.length;
  }, [rows]);

  return (
    <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
      <h3>Policy deck</h3>
      <p>{`rows: ${rows.length} topScore=${topScore.toFixed(4)} meanEvents=${meanEvents.toFixed(1)}`}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>seed</th>
            <th style={{ textAlign: 'left' }}>tenant</th>
            <th style={{ textAlign: 'left' }}>workspace</th>
            <th style={{ textAlign: 'left' }}>scenario</th>
            <th style={{ textAlign: 'right' }}>score</th>
            <th style={{ textAlign: 'right' }}>events</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.seed}>
              <td>{row.seed}</td>
              <td>{row.tenant}</td>
              <td>{row.workspace}</td>
              <td>{row.scenario}</td>
              <td style={{ textAlign: 'right' }}>{row.score.toFixed(4)}</td>
              <td style={{ textAlign: 'right' }}>{row.events}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
