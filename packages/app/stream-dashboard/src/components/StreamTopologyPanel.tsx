import { ReactNode } from 'react';
import { TopologyNode, TopologyEdge } from '@domain/streaming-engine';

export interface StreamTopologyPanelProps {
  streamId: string;
  nodes: ReadonlyArray<TopologyNode>;
  edges: ReadonlyArray<TopologyEdge>;
  onNodeFocus: (nodeId: string) => void;
}

export function StreamTopologyPanel({ streamId, nodes, edges, onNodeFocus }: StreamTopologyPanelProps) {
  const nodeMap = nodes.reduce<Record<string, TopologyNode>>((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});

  const sortedEdges = [...edges].sort((a, b) => a.from.localeCompare(b.from));

  const labels: Record<string, number> = {};
  for (const edge of sortedEdges) {
    labels[edge.from] = (labels[edge.from] ?? 0) + 1;
  }

  const rows: ReactNode[] = sortedEdges.map((edge) => {
    const from = nodeMap[edge.from];
    return (
      <tr key={`${edge.from}-${edge.to}`}>
        <td>{from?.id ?? edge.from}</td>
        <td>{edge.to}</td>
        <td>{from?.kind ?? 'unknown'}</td>
        <td>{labels[edge.from]}</td>
      </tr>
    );
  });

  return (
    <section>
      <h3>Topology {streamId}</h3>
      <p>Nodes: {nodes.length}, Edges: {edges.length}</p>
      <ol>
        {nodes.map((node) => (
          <li key={node.id}>
            <button type="button" onClick={() => onNodeFocus(node.id)}>
              {node.id}
            </button>
          </li>
        ))}
      </ol>
      <table>
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
            <th>Kind</th>
            <th>Out-degree</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </section>
  );
}
