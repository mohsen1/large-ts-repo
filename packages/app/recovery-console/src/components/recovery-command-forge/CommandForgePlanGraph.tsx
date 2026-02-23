import { useMemo, type ReactElement } from 'react';
import type { ForgeTopology } from '@domain/recovery-command-forge';
import { mapTopologyToRows } from '../../features/recovery-command-forge/engine';

interface Props {
  readonly topologies: readonly ForgeTopology[];
}

export const CommandForgePlanGraph = ({ topologies }: Props): ReactElement => {
  const rows = useMemo(
    () => topologies.flatMap((topology) => mapTopologyToRows(topology).map((row) => ({ ...row, wave: topology.wave }))),
    [topologies],
  );

  const highest = rows.reduce((acc, item) => Math.max(acc, item.progress), 0);

  return (
    <section className="command-forge-plan-graph">
      <h3>Plan waves</h3>
      <p>Nodes: {rows.length}</p>
      <p>{`Max progress: ${highest.toFixed(0)}%`}</p>
      <ul>
        {rows.map((row) => (
          <li key={`${row.wave}-${row.label}`}>
            {`wave-${row.wave}: ${row.label} (${row.progress})`}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p>No topology</p> : null}
    </section>
  );
};
