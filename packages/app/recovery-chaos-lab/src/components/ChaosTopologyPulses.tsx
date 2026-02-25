import { useMemo } from 'react';
import type { TopologyEdge, TopologyNode } from '@domain/recovery-chaos-sim-models';

export interface ChaosTopologyPulsesProps {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
}

interface NodeStat {
  readonly id: string;
  readonly pressure: number;
  readonly isIsolated: boolean;
}

export function ChaosTopologyPulses({ nodes, edges }: ChaosTopologyPulsesProps) {
  const edgeIndex = useMemo(() => {
    const index = new Map<string, number>();
    for (const edge of edges) {
      index.set(edge.from, (index.get(edge.from) ?? 0) + 1);
      index.set(edge.to, (index.get(edge.to) ?? 0) + 1);
    }
    return index;
  }, [edges]);

  const stats = useMemo(() => {
    return nodes.map<NodeStat>((node) => {
      const pressure = edgeIndex.get(node.id) ?? 0;
      const inbound = edges.some((edge) => edge.to === node.id);
      const outbound = edges.some((edge) => edge.from === node.id);
      return {
        id: node.id,
        pressure,
        isIsolated: !inbound && !outbound
      };
    });
  }, [edgeIndex, nodes]);

  const average = useMemo(() => {
    if (stats.length === 0) {
      return 0;
    }
    return stats.reduce((sum, item) => sum + item.pressure, 0) / stats.length;
  }, [stats]);

  return (
    <div className="chaos-topology-pulses">
      <h3>Topology</h3>
      <p>Average degree: {average.toFixed(2)}</p>
      <ul>
        {stats.map((item) => (
          <li key={item.id}>
            <span>{item.id}</span>
            <span>pressure {item.pressure}</span>
            <span>{item.isIsolated ? 'isolated' : 'connected'}</span>
          </li>
        ))}
      </ul>
      <p>Total nodes: {nodes.length}</p>
      <p>Total edges: {edges.length}</p>
    </div>
  );
}
