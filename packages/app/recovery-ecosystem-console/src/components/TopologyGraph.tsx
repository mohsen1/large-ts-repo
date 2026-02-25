import { useMemo, type ReactElement } from 'react';
import type { NamespaceTag } from '@domain/recovery-ecosystem-core';

interface TopologyGraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface TopologyNode {
  readonly id: string;
  readonly phase: string;
  readonly dependencyCount: number;
}

interface TopologyGraphProps {
  readonly namespace: NamespaceTag;
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyGraphEdge[];
  readonly selected?: string;
  readonly onSelect?: (id: string) => void;
}

interface StageBucket {
  readonly phase: string;
  readonly nodes: readonly TopologyNode[];
}

const nodeWidth = 120;

const computePosition = (index: number, total: number): { readonly x: number; readonly y: number } => {
  const angle = (Math.PI * 2 * index) / Math.max(1, total);
  return {
    x: Math.cos(angle) * 120 + 140,
    y: Math.sin(angle) * 120 + 140,
  };
};

const nodeClass = (dependencyCount: number): string =>
  dependencyCount === 0 ? 'node-root' : dependencyCount < 2 ? 'node-mid' : 'node-leaf';

export const TopologyGraph = ({ namespace, nodes, edges, selected, onSelect }: TopologyGraphProps): ReactElement => {
  const buckets = useMemo((): readonly StageBucket[] => {
    const grouped = new Map<string, TopologyNode[]>();
    for (const node of nodes) {
      const bucket = grouped.get(node.phase) ?? [];
      bucket.push(node);
      grouped.set(node.phase, bucket);
    }
    return [...grouped.entries()].map(([phase, list]) => ({ phase, nodes: list.toSorted((left, right) => left.id.localeCompare(right.id) ) }));
  }, [nodes]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selected),
    [nodes, selected],
  );

  return (
    <section className="topology-graph">
      <h2>Namespace: {namespace}</h2>
      <p>
        Nodes: {nodes.length} / Edges: {edges.length} / Buckets: {buckets.length}
      </p>
      <div
        className="topology-canvas"
        style={{
          position: 'relative',
          width: '100%',
          height: 320,
          border: '1px solid #ddd',
          marginBottom: 12,
        }}
      >
        {nodes.map((node, index) => {
          const position = computePosition(index, nodes.length);
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect?.(node.id)}
              style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                width: nodeWidth,
                transform: 'translate(-50%, -50%)',
                border: selected === node.id ? '2px solid #3f51b5' : '1px solid #999',
                borderRadius: 10,
                background: '#f7f7ff',
              }}
              className={nodeClass(node.dependencyCount)}
              title={node.phase}
            >
              <div>{node.id}</div>
              <small>{node.phase}</small>
            </button>
          );
        })}
        {edges.map((edge) => (
          <svg
            key={`${edge.from}-${edge.to}`}
            width="100%"
            height="100%"
            viewBox="0 0 280 280"
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
          >
            <line x1="140" y1="140" x2="140" y2="140" stroke="#aaa" />
          </svg>
        ))}
      </div>
      <dl>
        {buckets.map((bucket) => (
          <div key={bucket.phase}>
            <dt>{bucket.phase}</dt>
            <dd>{bucket.nodes.map((node) => node.id).join(', ')}</dd>
          </div>
        ))}
      </dl>
      {selectedNode ? (
        <aside>
          <h3>Selected</h3>
          <p>{selectedNode.id}</p>
          <p>deps: {selectedNode.dependencyCount}</p>
          <p>phase: {selectedNode.phase}</p>
        </aside>
      ) : null}
    </section>
  );
};
