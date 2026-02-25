import { useMemo } from 'react';

interface TopologyNode {
  id: string;
  label: string;
  score: number;
}

interface ResilienceTopologyChartProps {
  readonly nodes: readonly TopologyNode[];
}

const nodeToPercent = (node: TopologyNode): `${number}%` => `${Math.min(100, Math.max(10, Math.round(node.score * 10 + 10)))}%` as `${number}%`;

const sortNodes = (nodes: readonly TopologyNode[]): readonly TopologyNode[] =>
  [...nodes].sort((lhs, rhs) => rhs.score - lhs.score);

export const ResilienceTopologyChart = ({ nodes }: ResilienceTopologyChartProps) => {
  const ordered = useMemo(() => sortNodes(nodes), [nodes]);
  const palette = ['#5e6ad2', '#44a3be', '#7ca93f', '#b56ed6', '#f2a93b'];

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <h4>Topology</h4>
      {ordered.map((node, index) => (
        <div
          key={`${node.id}-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <strong>{node.label}</strong>
          <div
            style={{
              background: '#eee',
              borderRadius: '12px',
              height: '12px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: nodeToPercent(node),
                height: '100%',
                background: palette[index % palette.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
