import type { MeshTopology } from '@domain/recovery-fusion-intelligence';

interface FusionMeshTopologyPanelProps {
  readonly topology: MeshTopology | null;
}

export const FusionMeshTopologyPanel = ({ topology }: FusionMeshTopologyPanelProps) => {
  if (!topology) {
    return <section className="fusion-mesh-topology">No topology loaded</section>;
  }

  const nodes = topology.nodes.map((node) => (
    <li key={`${topology.runId}:${node.id}`}>
      {`${node.id} (${node.role}) phase=${node.phase} score=${node.score.toFixed(2)} active=${node.active}`}
    </li>
  ));

  const edges = topology.edges.map((edge, index) => (
    <li key={`${topology.runId}:edge:${index}`}>
      {`${edge.from} -> ${edge.to} | latency=${edge.latencyMs}ms | mandatory=${edge.mandatory ? 'y' : 'n'}`}
    </li>
  ));

  return (
    <section className="fusion-mesh-topology">
      <h3>Topology Snapshot</h3>
      <p>Run: {topology.runId}</p>
      <p>Nodes: {topology.nodes.length}</p>
      <p>Edges: {topology.edges.length}</p>
      <p>Updated: {topology.updatedAt}</p>
      <div>
        <strong>Node Map</strong>
        <ul>{nodes}</ul>
      </div>
      <div>
        <strong>Edges</strong>
        <ul>{edges}</ul>
      </div>
    </section>
  );
};
