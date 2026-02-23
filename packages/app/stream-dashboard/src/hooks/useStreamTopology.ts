import { useMemo, useState } from 'react';
import { TopologyNode, TopologyEdge, createTopology, validate } from '@domain/streaming-engine';
import { asStreamId } from '@domain/streaming-observability';

export interface TopologyState {
  selectedNodeId: string | null;
  errors: string[];
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

const defaultNodes: TopologyNode[] = [
  { id: 'source-1', kind: 'source', options: { kind: 'kinesis' } },
  { id: 'transform-1', kind: 'transform', options: { kind: 'enrich' } },
  { id: 'sink-1', kind: 'sink', options: { kind: 's3' } },
];

const defaultEdges: TopologyEdge[] = [
  { from: 'source-1', to: 'transform-1' },
  { from: 'transform-1', to: 'sink-1' },
];

export const useStreamTopology = (streamId: string) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const topology = useMemo(() => {
    const createdTopology = createTopology(
      {
        id: asStreamId(streamId),
        partitions: [{ id: 'p-0', startOffset: 0, endOffset: 1000 }],
        createdAt: new Date(),
      },
      defaultNodes,
      defaultEdges,
    );
    return {
      topology: createdTopology,
      validationErrors: validate(createdTopology),
      partitionCount: createdTopology.stream.partitions.length,
      selectedNodeId,
      nodes: defaultNodes,
      edges: defaultEdges,
    };
  }, [streamId, selectedNodeId]);

  return {
    selectedNodeId,
    setSelectedNodeId,
    errors: topology.validationErrors,
    partitionCount: topology.partitionCount,
    nodes: topology.nodes,
    edges: topology.edges,
  };
};
