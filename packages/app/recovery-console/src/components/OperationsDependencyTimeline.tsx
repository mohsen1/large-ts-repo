import { useMemo } from 'react';

interface Edge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly reliability: number;
}

interface Node {
  readonly id: string;
  readonly region: string;
  readonly criticality: number;
}

interface TimelineProps {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}

interface RenderNode {
  readonly x: number;
  readonly y: number;
  readonly node: Node;
}

const projectY = (index: number): number => 40 + index * 72;

const projectX = (reliability: number): number => Math.round(40 + reliability * 700);

const renderLines = (nodes: readonly RenderNode[], edges: readonly Edge[]) => {
  const indexById = new Map(nodes.map((entry) => [entry.node.id, entry] as const));
  return edges
    .map((edge) => {
      const source = indexById.get(edge.source);
      const target = indexById.get(edge.target);
      if (!source || !target) return undefined;

      return {
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        color: edge.reliability > 0.8 ? 'green' : edge.reliability > 0.5 ? 'orange' : 'red',
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
}

export const OperationsDependencyTimeline = ({ nodes, edges }: TimelineProps) => {
  const layout = useMemo(() => {
    return nodes.map((node, index) => ({
      node,
      x: projectX(0.18 + index * 0.13),
      y: projectY(index % 5),
    }));
  }, [nodes]);

  const lines = useMemo(() => renderLines(layout, edges), [layout, edges]);

  return (
    <svg width="880" height="500" viewBox="0 0 880 500" role="img" aria-label="dependency timeline">
      {lines.map((line, index) => (
        <line
          key={`${index}-${line.x1}-${line.y1}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.color}
          strokeWidth={2}
        />
      ))}
      {layout.map((entry) => (
        <g key={entry.node.id}>
          <circle
            cx={entry.x}
            cy={entry.y}
            r={16}
            fill={entry.node.criticality > 80 ? '#c0392b' : '#2980b9'}
          />
          <text x={entry.x} y={entry.y + 5} textAnchor="middle" fill="#fff" fontSize={11}>
            {entry.node.id}
          </text>
          <text x={entry.x} y={entry.y + 24} textAnchor="middle" fontSize={10}>
            {entry.node.region}
          </text>
        </g>
      ))}
    </svg>
  );
};
