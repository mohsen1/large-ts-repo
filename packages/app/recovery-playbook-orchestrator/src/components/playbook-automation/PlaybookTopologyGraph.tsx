import { useMemo } from 'react';
import type { PlaybookAutomationRunId } from '@domain/recovery-playbook-orchestration-core';

interface TopologyInput {
  readonly runs: readonly PlaybookAutomationRunId[];
}

interface Edge {
  readonly from: PlaybookAutomationRunId | 'start';
  readonly to: PlaybookAutomationRunId;
}

const buildEdges = (runs: readonly PlaybookAutomationRunId[]): readonly Edge[] =>
  runs.map((run, index) => ({
    from: index === 0 ? 'start' : runs[index - 1],
    to: run,
  }));

export const PlaybookTopologyGraph = ({ runs }: TopologyInput) => {
  const rows = useMemo(() => buildEdges(runs), [runs]);

  return (
    <table className="playbook-topology-graph">
      <thead>
        <tr>
          <th>From</th>
          <th>To</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${String(row.from)}-${String(row.to)}`}>
            <td>{String(row.from)}</td>
            <td>{String(row.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
