import { type PluginDefinition } from '@shared/stress-lab-runtime';
import {
  type MeshLane,
  type MeshKind,
  MeshManifest,
  MeshPath,
  MeshRunEnvelope,
  buildMeshFingerprint,
} from './mesh-types';

export interface MeshDependencyEdge<TNode extends string = string> {
  readonly from: TNode;
  readonly to: TNode;
  readonly requiredBy: readonly string[];
}

export interface MeshDependencyGraph {
  readonly namespace: string;
  readonly nodes: readonly string[];
  readonly edges: readonly MeshDependencyEdge[];
}

export interface MeshDependencyMatrix {
  readonly namespace: string;
  readonly matrix: ReadonlyMap<string, readonly string[]>;
  readonly order: readonly string[];
  readonly cycle: boolean;
}

export type MeshNodeRoute = MeshPath<readonly [MeshKind, MeshLane, 'control']>;

export const asNodeKey = (definition: { readonly id: string; readonly kind: MeshKind }): string => `${definition.kind}::${definition.id}`;

export const pluginToNode = <T extends PluginDefinition>(plugin: T): string => asNodeKey({ id: plugin.id, kind: `mesh/${String(plugin.kind).replace('stress-lab/', '')}` as MeshKind });

export const buildDependencyGraph = (definitions: readonly PluginDefinition[]): MeshDependencyGraph => {
  const nodes = definitions.map((plugin) => plugin.id as string);
  const edges: MeshDependencyEdge[] = definitions.flatMap((plugin) =>
    plugin.dependencies
      .filter((dependency) => typeof dependency === 'string')
      .map((dependency) => ({
        from: plugin.id,
        to: dependency.replace('dep:', ''),
        requiredBy: plugin.tags,
      })),
  );

  return {
    namespace: definitions[0]?.namespace ?? 'mesh:core',
    nodes,
    edges,
  };
};

const topologicalVisit = (
  node: string,
  graph: ReadonlyMap<string, readonly string[]>,
  state: Map<string, 'new' | 'visiting' | 'done'>,
  order: string[],
): boolean => {
  const current = state.get(node);
  if (current === 'done') {
    return false;
  }
  if (current === 'visiting') {
    return true;
  }

  state.set(node, 'visiting');
  const dependencies = graph.get(node) ?? [];
  let detectedCycle = false;
  for (const dependency of dependencies) {
    if (topologicalVisit(dependency, graph, state, order)) {
      detectedCycle = true;
      break;
    }
  }

  state.set(node, 'done');
  order.push(node);
  return detectedCycle;
};

export const buildDependencyMatrix = (definitions: readonly PluginDefinition[]): MeshDependencyMatrix => {
  const graph = new Map<string, readonly string[]>();
  for (const plugin of definitions) {
    graph.set(
      plugin.id,
      plugin.dependencies.map((dependency) => dependency.replace('dep:', '')),
    );
  }

  const ordered: string[] = [];
  const state = new Map<string, 'new' | 'visiting' | 'done'>();
  let cycle = false;

  for (const node of graph.keys()) {
    state.set(node, state.get(node) ?? 'new');
    if (topologicalVisit(node, graph, state, ordered)) {
      cycle = true;
    }
  }

  return {
    namespace: definitions[0]?.namespace ?? 'mesh:core',
    matrix: graph,
    order: ordered,
    cycle,
  };
};

export const summarizeGraph = (graph: MeshDependencyGraph): string => {
  const edges = graph.edges.length;
  const nodes = graph.nodes.length;
  const checksum = buildMeshFingerprint([`${graph.namespace}::${nodes}::${edges}`, `${graph.namespace}::${nodes}`]);
  return `${graph.namespace}|nodes=${nodes}|edges=${edges}|checksum=${checksum}`;
};

export const manifestToEdges = (manifest: MeshManifest): readonly MeshDependencyEdge[] =>
  manifest.constraints.flatMap((constraint) => {
    const source = `${manifest.namespace}::${constraint.lane}`;
    return [
      {
        from: source,
        to: `${constraint.id}`,
        requiredBy: [constraint.code, constraint.severity],
      },
    ];
  });

export const isCriticalPath = (pluginId: string, matrix: MeshDependencyMatrix, threshold: number): boolean => {
  const row = matrix.matrix.get(pluginId) ?? [];
  return row.length >= threshold;
};

export const rankByDependency = (matrix: MeshDependencyMatrix): ReadonlyMap<string, number> => {
  const scores = new Map<string, number>();
  for (const node of matrix.order) {
    const dependencies = matrix.matrix.get(node) ?? [];
    const total = dependencies.reduce((acc, dependency) => acc + (scores.get(dependency) ?? 0), 0);
    scores.set(node, total + 1);
  }
  return scores;
};

export const groupByRoute = (nodes: readonly string[], route: MeshNodeRoute): ReadonlyMap<string, readonly string[]> => {
  const [,,mode] = route.split('/');
  const grouped = new Map<string, readonly string[]>();
  grouped.set(mode, nodes);
  return grouped;
};

export const extractLane = (kind: MeshKind): MeshLane => {
  const suffix = kind.replace('mesh/', '') as MeshLane;
  return suffix;
};

export const partitionByDepth = (nodes: readonly string[]): readonly (readonly string[])[] => {
  if (nodes.length === 0) {
    return [];
  }

  const bucket = new Map<number, string[]>();
  for (const node of nodes) {
    const depth = node.split('::').length;
    const existing = bucket.get(depth) ?? [];
    existing.push(node);
    bucket.set(depth, existing);
  }

  return [...bucket.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, entries]) => [...entries]);
};

export const buildRoute = (kind: MeshKind, lane: MeshLane): MeshNodeRoute => `mesh/${lane}/control` as MeshNodeRoute;
