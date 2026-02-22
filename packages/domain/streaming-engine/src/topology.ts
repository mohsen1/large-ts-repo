import { StreamId, StreamInfo, StreamPartition } from './types';

export type NodeKind = 'source' | 'transform' | 'sink';

export interface TopologyNode {
  id: string;
  kind: NodeKind;
  options: Record<string, string>;
}

export interface TopologyEdge {
  from: string;
  to: string;
}

export interface Topology {
  stream: StreamInfo;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export function createTopology(stream: StreamInfo, nodes: TopologyNode[], edges: TopologyEdge[]): Topology {
  return { stream, nodes, edges };
}

export function validate(topology: Topology): string[] {
  const errors: string[] = [];
  const ids = new Set(topology.nodes.map((node) => node.id));
  for (const edge of topology.edges) {
    if (!ids.has(edge.from)) {
      errors.push(`missing from ${edge.from}`);
    }
    if (!ids.has(edge.to)) {
      errors.push(`missing to ${edge.to}`);
    }
  }
  return errors;
}

export function partitionCount(info: StreamInfo): number {
  return info.partitions.length;
}

export function withPartitions(id: StreamId, partitions: number): StreamInfo {
  const buckets: StreamPartition[] = [];
  for (let i = 0; i < partitions; i += 1) {
    buckets.push({ id: `p-${i}`, startOffset: 0, endOffset: 0 });
  }
  return { id, partitions: buckets, createdAt: new Date() };
}
