import { useMemo } from 'react';
import { OrchestrationNodeId } from '@domain/policy-orchestration';
import { StudioTopology } from '../models/policy-studio-types';

export interface PolicyTopologyBoardProps {
  readonly topology: StudioTopology;
  readonly selectedNodeIds: readonly OrchestrationNodeId[];
  readonly onNodeToggle: (nodeId: OrchestrationNodeId) => void;
  readonly onSelectGroup?: (section: StudioTopology['groups'][number]['section']) => void;
}

export const PolicyTopologyBoard = ({
  topology,
  selectedNodeIds,
  onNodeToggle,
  onSelectGroup,
}: PolicyTopologyBoardProps) => {
  const { nodes, edges, groups } = topology;
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const activeNodeIds = useMemo(() => nodes.filter((node) => selectedSet.has(node.nodeId)), [nodes, selectedSet]);

  return (
    <section>
      <h2>Policy Topology</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <div>
          <h3>Nodes</h3>
          <ul>
            {nodes.map((node) => (
              <li key={node.nodeId} style={{ marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => onNodeToggle(node.nodeId)}
                  style={{
                    color: selectedSet.has(node.nodeId) ? 'white' : 'black',
                    backgroundColor: selectedSet.has(node.nodeId) ? '#0b5ea8' : '#f0f0f0',
                    border: '1px solid #888',
                    borderRadius: '4px',
                    padding: '0.5rem',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <strong>{node.nodeId}</strong> {node.title} [{node.section}] [{node.nodeType}]
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Groups</h3>
          <ol>
            {groups.map((group) => (
              <li key={group.section}>
                <button
                  type="button"
                  onClick={() => onSelectGroup?.(group.section)}
                >
                  {group.section}
                </button>
                <span>({group.count})</span>
              </li>
            ))}
          </ol>
          <h3>Edges</h3>
          <ul>
            {edges.map((edge, index) => (
              <li key={`${edge.source}-${edge.target}-${index}`}>
                {edge.source} → {edge.target} [{edge.label}]
              </li>
            ))}
          </ul>
          <h3>Selected</h3>
          <ul>
            {activeNodeIds.map((node) => (
              <li key={node.nodeId}>{node.title}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

