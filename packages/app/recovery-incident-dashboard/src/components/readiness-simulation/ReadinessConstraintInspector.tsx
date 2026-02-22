import { useMemo } from 'react';
import type { ReadinessSimulationState } from '../../types/readinessSimulationConsole';

export interface ConstraintEntry {
  readonly key: string;
  readonly value: string;
}

interface Props {
  readonly state: ReadinessSimulationState;
}

const buildRows = (state: ReadinessSimulationState): readonly ConstraintEntry[] => {
  const byOwner = new Map<string, number>();
  for (const node of state.nodes) {
    byOwner.set(node.owner, (byOwner.get(node.owner) ?? 0) + 1);
  }

  const topNodes = [...byOwner.entries()]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count);

  return [
    { key: 'run-id', value: state.runId },
    { key: 'tenant', value: state.tenant },
    { key: 'total-nodes', value: String(state.nodes.length) },
    { key: 'active', value: String(state.active) },
    { key: 'top-owner', value: topNodes[0]?.owner ?? 'n/a' },
    { key: 'top-owner-count', value: String(topNodes[0]?.count ?? 0) },
  ];
};

export const ReadinessConstraintInspector = ({ state }: Props) => {
  const rows = useMemo(() => buildRows(state), [state]);

  return (
    <aside className="readiness-constraint-inspector">
      <h3>Simulation contract</h3>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th>{row.key}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
};
