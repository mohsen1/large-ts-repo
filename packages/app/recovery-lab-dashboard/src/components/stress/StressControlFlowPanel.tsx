import { useMemo } from 'react';
import { useStressCompilerGraph, type StressGraphNode } from '../../hooks/useStressCompilerGraph';

type StressControlFlowPanelProps = {
  readonly title: string;
};

export const StressControlFlowPanel = ({ title }: StressControlFlowPanelProps) => {
  const { state, graph, refresh } = useStressCompilerGraph();

  const severityColor = useMemo(() => {
    if (state.running) {
      return '#4338ca';
    }
    if (state.errors.length > 0) {
      return '#b91c1c';
    }
    return '#047857';
  }, [state.running, state.errors.length]);

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#f8fafc' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2>{title}</h2>
        <button type="button" onClick={() => void refresh()} style={{ color: severityColor }}>
          {state.running ? 'Rebuilding…' : 'Rebuild'}
        </button>
      </header>
      {state.manifest ? (
        <p>
          run={state.manifest.runId} seed={state.manifest.total} edges={graph.edges.length}
        </p>
      ) : (
        <p>loading manifest</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <h3>Nodes</h3>
          <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 220, overflowY: 'auto' }}>
            {graph.nodes.map((node: StressGraphNode) => {
              const stateLabel = node.active ? 'on' : 'off';
              return (
                <li key={node.id}>
                  <strong>{node.id}</strong> {node.label} [{stateLabel}] (w={node.weight})
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3>Edges</h3>
          <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 220, overflowY: 'auto' }}>
            {graph.edges.map((edge) => (
              <li key={`${edge.from}-${edge.to}`}>
                {edge.from} → {edge.to} ({edge.reason})
              </li>
            ))}
          </ul>
        </div>
      </div>
      {state.errors.length > 0 ? <p style={{ color: '#991b1b' }}>{state.errors.join(', ')}</p> : null}
    </section>
  );
};
