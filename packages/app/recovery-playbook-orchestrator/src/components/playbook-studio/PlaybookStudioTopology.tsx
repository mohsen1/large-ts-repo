import { memo } from 'react';
import { type TopologyNode } from '../../hooks/usePlaybookTopologyFlow';

export interface PlaybookStudioTopologyProps {
  readonly nodes: readonly TopologyNode[];
  readonly onNodeClick: (nodeId: string) => void;
  readonly selected?: string;
}

const byPath = (path: readonly string[]) => path.join(' → ');

const collectPaths = (nodes: readonly TopologyNode[]): readonly (readonly string[])[] =>
  nodes.map((node) => [node.label, ...node.connections]);

export const PlaybookStudioTopology = memo(({ nodes, onNodeClick, selected }: PlaybookStudioTopologyProps) => {
  const paths = collectPaths(nodes);

  return (
    <section className="playbook-studio-topology">
      <header>
        <h2>Topology Map</h2>
        <p>{paths.length} paths</p>
      </header>
      <ol>
        {paths.map((path) => (
          <li key={byPath(path)}>{byPath(path)}</li>
        ))}
      </ol>
      <div className="playbook-studio-topology__nodes">
        {nodes.map((node) => {
          const isSelected = selected === node.id;
          return (
            <button
              type="button"
              key={node.id}
              className={isSelected ? 'selected' : 'idle'}
              onClick={() => onNodeClick(node.id)}
            >
              {node.id}
            </button>
          );
        })}
      </div>
    </section>
  );
});

PlaybookStudioTopology.displayName = 'PlaybookStudioTopology';
