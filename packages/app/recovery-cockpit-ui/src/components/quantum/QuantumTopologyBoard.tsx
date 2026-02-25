import { FC, useMemo } from 'react';

type QuantumTopologyBoardProps = {
  readonly nodes: readonly { readonly id: string; readonly route: string; readonly role: 'source' | 'processor' | 'sink' }[];
  readonly edges: readonly { readonly from: string; readonly to: string; readonly latencyMs: number }[];
};

export const QuantumTopologyBoard: FC<QuantumTopologyBoardProps> = ({ nodes, edges }) => {
  const nodeMap = useMemo(() => {
    const map = new Map<string, { route: string; role: string }>();
    for (const node of nodes) {
      map.set(node.id, { route: node.route, role: node.role });
    }
    return map;
  }, [nodes]);

  return (
    <section style={{ border: '1px solid #d7dbe8', borderRadius: 12, padding: 14 }}>
      <h3>Topology</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {nodes.map((node) => (
          <article key={node.id} style={{ display: 'grid', gap: 4 }}>
            <strong>{node.id}</strong>
            <span>route: {node.route}</span>
            <span>role: {node.role}</span>
          </article>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          return (
            <p key={`${edge.from}-${edge.to}`}>
              {edge.from} ({from?.role ?? 'unknown'})
              {' -> '}
              {edge.to} ({to?.role ?? 'unknown'})
              {' @'}
              {edge.latencyMs}ms
            </p>
          );
        })}
      </div>
    </section>
  );
};
