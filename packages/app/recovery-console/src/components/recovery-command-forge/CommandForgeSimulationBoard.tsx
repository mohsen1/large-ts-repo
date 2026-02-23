import type { ForgeExecutionReport } from '@domain/recovery-command-forge';
import { useMemo } from 'react';

interface Props {
  readonly reports: readonly ForgeExecutionReport[];
  readonly onSelect: (planId: string) => void;
}

interface Row {
  readonly planId: string;
  readonly score: number;
  readonly nodes: number;
  readonly outcomes: number;
}

const toRows = (reports: readonly ForgeExecutionReport[]): readonly Row[] =>
  reports.map((report) => ({
    planId: report.scenarioHash,
    score: report.policy.riskScore,
    nodes: report.topologies.reduce((acc, topology) => acc + topology.nodes.length, 0),
    outcomes: report.outcomes.length,
  }));

export const CommandForgeSimulationBoard = ({ reports, onSelect }: Props) => {
  const rows = useMemo(() => [...toRows(reports)], [reports]);
  const totalNodes = useMemo(() => rows.reduce((acc, row) => acc + row.nodes, 0), [rows]);
  const totalOutcomes = useMemo(() => rows.reduce((acc, row) => acc + row.outcomes, 0), [rows]);

  return (
    <section className="command-forge-sim-board">
      <h2>Simulation board</h2>
      <p>{`rows=${rows.length}, nodes=${totalNodes}, outcomes=${totalOutcomes}`}</p>
      <table>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Score</th>
            <th>Nodes</th>
            <th>Outcomes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.planId}>
              <td>
                <button type="button" onClick={() => onSelect(row.planId)}>{row.planId}</button>
              </td>
              <td>{row.score}</td>
              <td>{row.nodes}</td>
              <td>{row.outcomes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
