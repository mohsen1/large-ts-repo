import { useMemo } from 'react';
import { useStreamTopology } from '../hooks/useStreamTopology';
import { StreamTopologyPanel } from '../components/StreamTopologyPanel';

export function StreamingTopologyPage() {
  const streamId = 'stream-core-analytics';
  const state = useStreamTopology(streamId);
  const nodes = useMemo(() => state.nodes ?? [], [state]);
  const edges = useMemo(() => state.edges ?? [], [state]);

  if (state.errors.length > 0) {
    return (
      <main>
        <h1>Topology Validation</h1>
        <ul>
          {state.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      </main>
    );
  }

  return (
    <main>
      <h1>Topology</h1>
      <StreamTopologyPanel streamId={streamId} nodes={nodes} edges={edges} onNodeFocus={(nodeId) => state.setSelectedNodeId(nodeId)} />
    </main>
  );
}
