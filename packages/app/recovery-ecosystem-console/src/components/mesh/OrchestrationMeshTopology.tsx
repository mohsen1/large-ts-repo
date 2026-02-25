import { useMemo } from 'react';
import type { MeshPluginDefinition } from '@domain/recovery-ecosystem-orchestrator-core';

interface TopologyEdge {
  readonly from: string;
  readonly to: string;
}

interface TopologyProps {
  readonly plugins: readonly MeshPluginDefinition[];
}

const collectEdges = (plugins: readonly MeshPluginDefinition[]): TopologyEdge[] =>
  plugins.flatMap((plugin) =>
    plugin.dependencies.map((dependency) => ({
      from: dependency,
      to: plugin.name,
    })),
  );

export const OrchestrationMeshTopology = (props: TopologyProps) => {
  const edges = useMemo(() => collectEdges(props.plugins), [props.plugins]);
  const byTarget = useMemo(
    () =>
      edges.reduce(
        (acc, edge) => {
          const bucket = acc.get(edge.to) ?? [];
          bucket.push(edge.from);
          acc.set(edge.to, bucket);
          return acc;
        },
        new Map<string, string[]>(),
      ),
    [edges],
  );

  return (
    <section>
      <h3>Plugin Topology</h3>
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Depends on</th>
          </tr>
        </thead>
        <tbody>
          {props.plugins.map((plugin) => (
            <tr key={plugin.name}>
              <td>{plugin.name}</td>
              <td>{byTarget.get(plugin.name)?.join(', ') || 'none'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
