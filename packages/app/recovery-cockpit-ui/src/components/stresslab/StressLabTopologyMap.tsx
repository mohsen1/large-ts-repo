import { FC, memo } from 'react';

export type TopologyNode = {
  readonly id: string;
  readonly label: string;
  readonly team: string;
  readonly active: boolean;
};

export type TopologyEdge = {
  readonly from: string;
  readonly to: string;
  readonly coupling: number;
};

export interface StressLabTopologyMapProps {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
}

const nodeKey = (node: TopologyNode) => `${node.team}:${node.id}`;

const couplingStyle = (value: number) => {
  if (value >= 0.85) return '#b91c1c';
  if (value >= 0.55) return '#d97706';
  return '#15803d';
};

export const StressLabTopologyMap: FC<StressLabTopologyMapProps> = memo(({ nodes, edges }) => {
  const orderedNodes = [...nodes].sort((left, right) => right.label.localeCompare(left.label));

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 12 }}>
      <header>
        <h3 style={{ margin: 0 }}>Topology Map</h3>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <h4>Nodes ({orderedNodes.length})</h4>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {orderedNodes.map((node) => {
              const active = node.active ? 'online' : 'offline';
              return (
                <li
                  key={nodeKey(node)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderLeft: `4px solid ${node.active ? '#16a34a' : '#9ca3af'}`,
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <strong>{node.label}</strong>
                  <p style={{ margin: 0 }}>{node.id}</p>
                  <small>{active}</small>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h4>Edges ({edges.length})</h4>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {edges.map((edge, index) => (
              <li
                key={`${edge.from}-${edge.to}-${index}`}
                style={{
                  border: '1px solid #e5e7eb',
                  borderLeft: `4px solid ${couplingStyle(edge.coupling)}`,
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{edge.from}</span>
                  <span>{edge.to}</span>
                </div>
                <small>coupling {edge.coupling.toFixed(2)}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
});

