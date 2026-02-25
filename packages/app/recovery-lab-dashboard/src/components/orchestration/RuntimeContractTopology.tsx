import { useMemo } from 'react';
import type { RuntimeSignal } from '../../hooks/useOrchestrationFacadeModel';

type TopologyNode = {
  readonly id: string;
  readonly owner: string;
  readonly score: number;
  readonly signal: RuntimeSignal;
};

type TopologyLink = {
  readonly from: string;
  readonly to: string;
  readonly phase: 'observe' | 'stabilize' | 'validate';
};

interface RuntimeContractTopologyProps {
  readonly nodes: readonly TopologyNode[];
  readonly links: readonly TopologyLink[];
  readonly onSelect?: (nodeId: string) => void;
}

export const RuntimeContractTopology = ({ nodes, links, onSelect }: RuntimeContractTopologyProps) => {
  const grouped = useMemo(
    () => nodes.toSorted((left, right) => right.score - left.score),
    [nodes],
  );

  const signalsByOwner = useMemo(() => {
    const map = new Map<string, RuntimeSignal>();
    for (const node of nodes) {
      map.set(node.owner, node.score >= 0.8 ? 'critical' : node.score >= 0.5 ? 'warning' : 'signal');
    }
    return map;
  }, [nodes]);

  return (
    <section style={{ border: '1px solid #d1d5db', padding: 14, borderRadius: 10, background: '#f8fafc' }}>
      <h3>Contract topology</h3>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <p>Total nodes: {nodes.length}</p>
        <p>Total links: {links.length}</p>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {grouped.map((node) => (
          <li key={node.id} style={{ marginBottom: 6 }}>
            <button
              type="button"
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
              onClick={() => onSelect?.(node.id)}
            >
              {node.id}
            </button>
            <span style={{ marginLeft: 8 }}>owner={node.owner}</span>
            <span style={{ marginLeft: 8 }}>score={node.score.toFixed(2)}</span>
            <span style={{ marginLeft: 8 }}>signal={node.signal}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Owner signals</h4>
        {[...signalsByOwner.entries()].map(([owner, signal]) => (
          <p key={owner} style={{ margin: '2px 0' }}>
            {owner}: {signal}
          </p>
        ))}
      </div>
    </section>
  );
};
