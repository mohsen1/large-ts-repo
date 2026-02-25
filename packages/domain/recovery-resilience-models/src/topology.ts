import { type MeshChannel, asNodeId, type RuntimeTopology, RuntimeTopology as Topology } from '@shared/recovery-ops-runtime';
import { z } from 'zod';

export const topologyKindSchema = z.union([
  z.literal('linear'),
  z.literal('star'),
  z.literal('mesh'),
]);

export type TopologyKind = z.infer<typeof topologyKindSchema>;

export interface TopologyNode {
  readonly id: string;
  readonly name: string;
  readonly zone: string;
  readonly capacity: number;
}

export interface TopologyEdge {
  readonly from: string;
  readonly to: string;
  readonly quality: number;
}

export interface TopologyDefinition {
  readonly kind: TopologyKind;
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
}

export const buildTopology = (definition: TopologyDefinition, graph = new Topology()): { snapshot: ReturnType<Topology['snapshot']> } => {
  for (const node of definition.nodes) {
    graph.addNode({
      id: asNodeId(`${definition.kind}-${node.id}`),
      label: node.name,
      zone: 'core',
      channels: ['analysis'],
      input: node,
      output: node,
    });
  }

  for (const edge of definition.edges) {
    graph.addEdge({
      from: asNodeId(`${definition.kind}-${edge.from}`),
      to: asNodeId(`${definition.kind}-${edge.to}`),
      latencyMs: edge.quality * 10,
    });
  }

  return {
    snapshot: graph.snapshot(),
  };
};

export const describeTopology = (
  payload: TopologyDefinition,
): { kind: TopologyKind; channels: readonly MeshChannel[] } => {
  switch (payload.kind) {
    case 'linear':
      return { kind: payload.kind, channels: ['analysis', 'dispatch'] };
    case 'star':
      return { kind: payload.kind, channels: ['analysis', 'repair'] };
    case 'mesh':
      return { kind: payload.kind, channels: ['analysis', 'verification'] };
    default:
      return { kind: payload.kind, channels: ['analysis'] };
  }
};

export const inferChannels = (nodes: readonly TopologyNode[]): readonly MeshChannel[] => {
  const sorted = [...nodes].sort((lhs, rhs) => lhs.capacity - rhs.capacity);
  return sorted.map((node, index) => (index % 2 === 0 ? 'analysis' : 'dispatch'));
};
