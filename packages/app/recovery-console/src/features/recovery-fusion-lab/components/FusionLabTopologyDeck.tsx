import { memo } from 'react';

import type { FusionLabTopologyNode } from '../types';

import type { FusionLabTopologyProps } from '../types';

const scoreClass = (score: number): string => {
  if (score >= 0.85) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
};

export const FusionLabTopologyDeck = memo(function FusionLabTopologyDeck({
  nodes,
  selectedId,
  onSelect,
}: FusionLabTopologyProps) {
  return (
    <section>
      <h3>Fusion Lab Topology</h3>
      <ul>
        {nodes.map((node) => (
          <li
            key={node.id}
            data-active={node.active}
            data-score={scoreClass(node.score)}
            onClick={() => onSelect(node.id)}
            style={{
              cursor: 'pointer',
              border: node.id === selectedId ? '1px solid #60a5fa' : '1px solid transparent',
              padding: 8,
              marginBottom: 6,
              listStyle: 'none',
              borderRadius: 6,
              background: node.id === selectedId ? '#1f2937' : '#111827',
            }}
          >
            <strong>{node.name}</strong>
            <p>score: {(node.score * 100).toFixed(1)}%</p>
            <small>active: {node.active ? 'yes' : 'no'}</small>
          </li>
        ))}
      </ul>
    </section>
  );
});
