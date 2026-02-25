import {
  buildVertexMap,
  linkTopology,
  walkTopology,
  type TopologyMap,
  type TopologyVertex,
} from '@shared/command-graph-kernel';
import type { CommandDependencyEdge, CommandId, WorkspaceBlueprint } from './models';

export interface VertexCatalog {
  readonly id: CommandId;
  readonly title: string;
  readonly metadata: Record<string, unknown>;
}

const normalizeVertex = (commandId: CommandId): string => String(commandId).replace('command:', '');

export const graphNodesFromBlueprint = (blueprint: WorkspaceBlueprint): readonly VertexCatalog[] => {
  const lookup = new Map<string, VertexCatalog>();
  for (const commandId of blueprint.commandOrder) {
    lookup.set(String(commandId), {
      id: commandId,
      title: String(commandId),
      metadata: { kind: 'command' },
    });
  }

  for (const edge of blueprint.graph) {
    lookup.set(String(edge.from), lookup.get(String(edge.from)) ?? {
      id: edge.from,
      title: String(edge.from),
      metadata: { kind: 'command-edge', label: edge.label },
    });
    lookup.set(String(edge.to), lookup.get(String(edge.to)) ?? {
      id: edge.to,
      title: String(edge.to),
      metadata: { kind: 'command-edge', label: edge.label },
    });
  }

  return [...lookup.values()];
};

export const graphEdgesFromBlueprint = (blueprint: WorkspaceBlueprint): readonly {
  readonly from: CommandId;
  readonly to: CommandId;
  readonly label: string;
}[] =>
  blueprint.graph.map((edge) => ({
    from: edge.from,
    to: edge.to,
    label: edge.label,
  }));

export const buildTopology = (blueprint: WorkspaceBlueprint): TopologyMap<Record<string, readonly string[]>> => {
  const vertices = graphNodesFromBlueprint(blueprint);
  const topologyVertices: TopologyVertex[] = vertices.map((vertex) => ({
    id: `vertex:${normalizeVertex(vertex.id)}` as const,
    label: vertex.title,
    metadata: vertex.metadata,
  }));

  const topology = buildVertexMap(topologyVertices);

  const mappedEdges = blueprint.graph.map((edge) => ({
    id: `edge:${String(edge.from)}->${String(edge.to)}` as const,
    from: `vertex:${normalizeVertex(edge.from)}` as const,
    to: `vertex:${normalizeVertex(edge.to)}` as const,
    weight: 1,
  }));

  return linkTopology(topology, mappedEdges);
};

export const walkFrom = (
  blueprint: WorkspaceBlueprint,
  entryPoint: CommandId,
): readonly string[] => {
  const topology = buildTopology(blueprint);
  const key = normalizeVertex(entryPoint);
  return walkTopology(topology, key);
};

export const replayEdges = (blueprint: WorkspaceBlueprint): readonly CommandDependencyEdge[] =>
  blueprint.graph.filter((edge) => edge.label.startsWith('replay::'));
