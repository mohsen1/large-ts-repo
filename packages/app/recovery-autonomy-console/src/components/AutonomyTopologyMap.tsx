import { useMemo } from 'react';
import { AUTONOMY_SCOPE_SEQUENCE, type AutonomyScope, type AutonomySignalEnvelope } from '@domain/recovery-autonomy-graph';
import { useAutonomyOverview } from '../hooks/useAutonomyOverview';

interface AutonomyTopologyMapProps {
  readonly tenantId: string;
  readonly graphId: string;
}

type TopologyNode = {
  readonly id: string;
  readonly stage: AutonomyScope;
  readonly signalCount: number;
  readonly connected: boolean;
};

const buildNodes = (graphId: string, counts: Readonly<Record<string, number>>): readonly TopologyNode[] =>
  AUTONOMY_SCOPE_SEQUENCE.map((scope, index) => ({
    id: `${graphId}-node-${index}`,
    stage: scope,
    signalCount: counts[scope] ?? 0,
    connected: (counts[scope] ?? 0) > 0,
  }));

const edgeWeights = (nodes: readonly TopologyNode[]) =>
  nodes
    .map((node, index, values) => ({
      from: node.id,
      to: values[index + 1]?.id ?? node.id,
      weight: node.signalCount,
    }))
    .filter((edge) => edge.weight > 0);

const aggregate = (signals: readonly AutonomySignalEnvelope[]): readonly { readonly scope: string; readonly signalCount: number }[] => {
  const bucket = signals.reduce<Record<string, number>>((acc, signal) => {
    acc[signal.scope] = (acc[signal.scope] ?? 0) + 1;
    return acc;
  }, {});

  return AUTONOMY_SCOPE_SEQUENCE.map((scope) => ({
    scope,
    signalCount: bucket[scope] ?? 0,
  }));
};

export const AutonomyTopologyMap = ({ tenantId, graphId }: AutonomyTopologyMapProps) => {
  const overview = useAutonomyOverview(tenantId, graphId);

  const { nodes, edges, total } = useMemo(() => {
    const buckets = aggregate(overview.signals);
    const bucketMap = buckets.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.scope] = entry.signalCount;
      return acc;
    }, {});

    const nextNodes = buildNodes(graphId, bucketMap);
    const nextEdges = edgeWeights(nextNodes);
    const totalSignals = buckets.reduce((acc, entry) => acc + entry.signalCount, 0);

    return {
      nodes: nextNodes,
      edges: nextEdges,
      total: totalSignals,
    };
  }, [overview.signals, graphId]);

  return (
    <section>
      <h3>Topology Map</h3>
      <p>Total Signals: {total}</p>
      <p>{overview.loading ? 'Loading signal graph…' : 'Topology snapshot ready'}</p>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{node.stage}</span>
            <span style={{ opacity: 0.8 }}> · {node.signalCount}</span>
            <span style={{ color: node.connected ? 'seagreen' : 'grey' }}>
              {node.connected ? ' · connected' : ' · idle'}
            </span>
          </li>
        ))}
      </ul>
      <p>Edges: {edges.length}</p>
      <button type="button" onClick={() => void overview.hydrate()}>
        Recompute
      </button>
    </section>
  );
};
