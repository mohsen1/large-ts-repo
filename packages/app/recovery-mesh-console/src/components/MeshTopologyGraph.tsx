import { useMemo } from 'react';
import { createTopologyFromSignal } from '../services/meshTopologyService';
import { type MeshNodeContract, type MeshTopology } from '@domain/recovery-ops-mesh';

export interface MeshTopologyGraphProps {
  readonly topology: MeshTopology;
  readonly selectedKind: string;
  readonly onNodeSelect: (nodeId: MeshNodeContract['id']) => void;
}

interface NodeStats {
  readonly id: MeshNodeContract['id'];
  readonly score: number;
  readonly active: boolean;
}

export const MeshTopologyGraph = ({ topology, selectedKind, onNodeSelect }: MeshTopologyGraphProps) => {
  const items = useMemo(
    () =>
      topology.nodes.map((node, index): NodeStats & { node: MeshNodeContract } => {
        const score = ((index + 1) * (selectedKind.length % 7 + 1)) / (topology.links.length + 1);
        return {
          id: node.id,
          score,
          active: index % 2 === 0,
          node,
        };
      }),
    [selectedKind.length, topology],
  );

  const path = useMemo(() => createTopologyFromSignal(topology, selectedKind), [topology, selectedKind]);

  return (
    <section>
      <header>
        <h3>Mesh Topology Graph</h3>
        <p>Computed path count: {path.length}</p>
      </header>
      <ul>
        {items.map((item) => {
          const cls = item.active ? 'node node--active' : 'node';
          return (
            <li key={item.id}>
              <button
                type="button"
                className={cls}
                onClick={() => onNodeSelect(item.node.id)}
              >
                {item.node.label}
                <span>{item.score.toFixed(2)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export const MeshTopologyMiniCard = ({ topology }: { readonly topology: MeshTopology }) => {
  const title = useMemo(() => {
    if (topology.nodes.length === 0) {
      return `${topology.name} has no nodes`;
    }

    const primary = topology.nodes
      .map((node) => node.id)
      .reduce((acc, item, index) => `${acc}${index === 0 ? '' : '|'}${item}`, '')
      .trim();

    return `${topology.name}: ${topology.version} [${primary}]`;
  }, [topology]);

  return <p>{title}</p>;
};

export const MeshGraphLegend = ({ topology }: { readonly topology: MeshTopology }) => {
  const rows = useMemo(
    () =>
      topology.links.map((link) => ({
        id: link.id,
        title: `${link.from} => ${link.to}`,
        retry: link.retryLimit,
      })),
    [topology],
  );

  return (
    <section>
      <h4>Legend</h4>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.title} (retry {row.retry})
          </li>
        ))}
      </ul>
    </section>
  );
};
