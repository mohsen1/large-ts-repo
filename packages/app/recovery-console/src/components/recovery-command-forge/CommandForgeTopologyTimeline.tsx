import type { ForgeTopology } from '@domain/recovery-command-forge';
import { useMemo } from 'react';

interface Props {
  readonly topologies: readonly ForgeTopology[];
}

interface Tile {
  readonly plan: string;
  readonly wave: number;
  readonly nodes: string[];
  readonly progress: number;
}

const parseTile = (topology: ForgeTopology): Tile => ({
  plan: topology.planId,
  wave: topology.wave,
  nodes: topology.nodes.map((entry) => entry.node.id),
  progress: topology.nodes.reduce((acc, node) => acc + node.progress, 0) / Math.max(1, topology.nodes.length),
});

export const CommandForgeTopologyTimeline = ({ topologies }: Props) => {
  const sorted = useMemo(() => [...topologies].sort((left, right) => left.wave - right.wave), [topologies]);
  const tiles = useMemo(() => sorted.map((item) => parseTile(item)), [sorted]);

  return (
    <section className="command-forge-timeline">
      <h2>Topology timeline</h2>
      <ul>
        {tiles.map((tile) => (
          <li key={`${tile.plan}-${tile.wave}`}>
            <div>
              <strong>{`wave ${tile.wave}`}</strong>
              {' '}
              <small>{`plan=${tile.plan}`}</small>
              {' '}
              <small>{`progress=${tile.progress.toFixed(2)}`}</small>
            </div>
            <div className="node-grid">
              {tile.nodes.map((nodeId) => (
                <span key={nodeId}>{nodeId}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
