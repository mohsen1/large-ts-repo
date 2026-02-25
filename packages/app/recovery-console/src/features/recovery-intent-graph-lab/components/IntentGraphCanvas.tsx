import { useMemo } from 'react';
import type { IntentLabNode, IntentLabEdge } from '../types';

interface IntentGraphCanvasProps {
  readonly nodes: readonly IntentLabNode[];
  readonly edges: readonly IntentLabEdge[];
  readonly onSelectNode: (nodeId: string) => void;
}

const resolvePosition = (index: number): { x: number; y: number } => ({
  x: 20 + (index % 5) * 180 + (index % 2) * 20,
  y: 24 + Math.floor(index / 5) * 80,
});

const nodeColor = (kind: IntentLabNode['kind']): string => {
  switch (kind) {
    case 'source':
      return '#1f77b4';
    case 'transform':
      return '#2ca02c';
    case 'sink':
      return '#d62728';
    case 'validation':
      return '#9467bd';
    default:
      return '#7f7f7f';
  }
};

export const IntentGraphCanvas = ({ nodes, edges, onSelectNode }: IntentGraphCanvasProps) => {
  const nodeById = useMemo(
    () =>
      nodes.reduce<Record<string, IntentLabNode>>((accumulator, node) => {
        accumulator[node.id] = node;
        return accumulator;
      }, {}),
    [nodes],
  );

  return (
    <section>
      <h2>Intent topology</h2>
      <svg height={Math.max(220, Math.ceil(nodes.length / 4) * 110)} viewBox="0 0 900 320" width="100%">
        {edges.map((edge) => {
          const fromNode = nodeById[edge.from];
          const toNode = nodeById[edge.to];
          if (!fromNode || !toNode) {
            return null;
          }

          const fromIndex = nodes.findIndex((node) => node.id === edge.from);
          const toIndex = nodes.findIndex((node) => node.id === edge.to);
          const from = resolvePosition(fromIndex);
          const to = resolvePosition(toIndex);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line
                x1={from.x + 70}
                y1={from.y + 36}
                x2={to.x + 14}
                y2={to.y + 36}
                stroke="#333"
                strokeWidth={edge.weight}
              />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} fill="#666" fontSize="10">
                {edge.weight}
              </text>
            </g>
          );
        })}
        {nodes.map((node, index) => {
          const position = resolvePosition(index);
          return (
            <g key={node.id}>
              <rect
                x={position.x}
                y={position.y}
                width="140"
                height="72"
                rx="8"
                fill={nodeColor(node.kind)}
                stroke="#111"
                onClick={() => onSelectNode(node.id)}
              />
              <text x={position.x + 10} y={position.y + 22} fill="#fff" fontSize="12">
                {node.title}
              </text>
              <text x={position.x + 10} y={position.y + 42} fill="#e6e6e6" fontSize="10">
                {node.kind}
              </text>
              <text x={position.x + 10} y={position.y + 58} fill="#f9f9f9" fontSize="10">
                score={node.score.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
};
