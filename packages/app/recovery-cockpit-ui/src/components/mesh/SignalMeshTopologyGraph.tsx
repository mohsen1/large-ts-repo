import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { MeshNode, MeshTopology } from '@domain/recovery-cockpit-signal-mesh';

export interface SignalMeshTopologyGraphProps {
  readonly topology: MeshTopology;
  readonly selectedNode?: string;
  readonly onSelectNode?: (node: MeshNode) => void;
  readonly onHoverNode?: (node: MeshNode) => void;
}

export function SignalMeshTopologyGraph({
  topology,
  selectedNode,
  onSelectNode,
  onHoverNode,
}: SignalMeshTopologyGraphProps): ReactElement {
  const nodesByHealth = useMemo(
    () =>
      [...topology.nodes].sort((left, right) => {
        if (left.health === right.health) {
          return left.id.localeCompare(right.id);
        }
        return right.health - left.health;
      }),
    [topology.nodes],
  );

  const linksByWeight = useMemo(
    () => [...topology.edges].sort((left, right) => right.weight - left.weight),
    [topology.edges],
  );

  return (
    <section>
      <h3>Topology Graph</h3>
      <ul>
        {nodesByHealth.map((node) => {
          const isActive = selectedNode !== undefined && selectedNode === node.id;
          return (
            <li key={node.id} onMouseEnter={() => onHoverNode?.(node)} onClick={() => onSelectNode?.(node)}>
              <span data-active={isActive}>{node.id}</span>
              <span>{node.stage}</span>
              <progress value={node.health} max={100} />
            </li>
          );
        })}
      </ul>
      <ol>
        {linksByWeight.map((edge) => (
          <li key={`${edge.from}-${edge.to}`}>
            {edge.from}→{edge.to} ({edge.weight.toFixed(2)})
          </li>
        ))}
      </ol>
    </section>
  );
}
