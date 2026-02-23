import type { WorkloadDependencyGraph } from '@domain/recovery-workload-intelligence';

interface WorkloadTopologyPanelProps {
  readonly graph: WorkloadDependencyGraph;
}

export const WorkloadTopologyPanel = ({ graph }: WorkloadTopologyPanelProps) => {
  const nodes = graph.nodes;
  const edges = graph.edges;
  return (
    <section className="workload-topology">
      <h3>Dependency Topology</h3>
      <div className="workload-topology-summary">
        <p>Nodes: {nodes.length}</p>
        <p>Edges: {edges.length}</p>
      </div>
      <ul>
        {nodes.map((node) => {
          const outgoing = edges.filter((edge) => edge.parent === node.id);
          return (
            <li key={node.id}>
              <h4>{node.name}</h4>
              <p>{node.team} · {node.region}</p>
              <p>Criticality: {node.criticality}</p>
              <ul>
                {outgoing.length === 0 ? (
                  <li>No outgoing dependencies</li>
                ) : (
                  outgoing.map((edge) => (
                    <li key={`${edge.parent}-${edge.child}`}>
                      {edge.parent} → {edge.child} · {edge.relationship} ({edge.latencyMs}ms)
                    </li>
                  ))
                )}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
