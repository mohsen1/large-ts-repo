import type { SurfaceNodeId, SurfaceNodePath, SurfacePluginId, SurfaceWorkspaceId } from './identity';

export interface SurfaceEdge {
  readonly from: SurfaceNodeId;
  readonly to: SurfaceNodeId;
  readonly weight: number;
  readonly lane: string;
}

export interface SurfaceTopologyNode {
  readonly id: SurfaceNodeId;
  readonly workspaceId: SurfaceWorkspaceId;
  readonly label: string;
  readonly tags: readonly string[];
  readonly createdAt: number;
}

export interface SurfaceTopologyManifest {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly nodes: readonly SurfaceTopologyNode[];
  readonly edges: readonly SurfaceEdge[];
}

type NoInfer<T> = [T][T extends any ? 0 : never];
type EdgeIndexMap = Record<string, SurfaceEdge[]>;

const identityEdgeKey = <TSource extends string, TTarget extends string>(source: TSource, target: TTarget): `${TSource}->${TTarget}` =>
  `${source}->${target}` as `${TSource}->${TTarget}`;

export type PlanStep<TNodeId extends SurfaceNodeId = SurfaceNodeId> = readonly [TNodeId, ...TNodeId[]];

export class SurfacePlanGraph {
  readonly #nodes = new Map<SurfaceNodeId, SurfaceTopologyNode>();
  readonly #edges = new Map<SurfaceNodeId, SurfaceEdge[]>();
  readonly #workspaceId: SurfaceWorkspaceId;

  constructor(workspaceId: SurfaceWorkspaceId) {
    this.#workspaceId = workspaceId;
  }

  addNode(node: SurfaceTopologyNode): this {
    this.#nodes.set(node.id, node);
    if (!this.#edges.has(node.id)) {
      this.#edges.set(node.id, []);
    }
    return this;
  }

  addEdge(edge: SurfaceEdge): this {
    const existing = this.#edges.get(edge.from) ?? [];
    this.#edges.set(edge.from, [...existing, edge]);
    return this;
  }

  buildFromManifest(manifest: SurfaceTopologyManifest): this {
    for (const node of manifest.nodes) {
      this.addNode(node);
    }
    for (const edge of manifest.edges) {
      this.addEdge(edge);
    }
    return this;
  }

  get workspaceId(): SurfaceWorkspaceId {
    return this.#workspaceId;
  }

  get nodes(): readonly SurfaceTopologyNode[] {
    return [...this.#nodes.values()];
  }

  node(nodeId: SurfaceNodeId): SurfaceTopologyNode | undefined {
    return this.#nodes.get(nodeId);
  }

  adjacency(nodeId: SurfaceNodeId): readonly SurfaceEdge[] {
    return this.#edges.get(nodeId) ?? [];
  }

  route(source: SurfaceNodeId, target: SurfaceNodeId): readonly SurfaceNodeId[] {
    const visited = new Set<SurfaceNodeId>();
    const route: SurfaceTopologyNode[] = [];
    const result = this.pathFrom(source, target, visited, route);
    return (result ?? []).map((node) => node.id);
  }

  private pathFrom(
    current: SurfaceNodeId,
    target: SurfaceNodeId,
    visited: Set<SurfaceNodeId>,
    route: SurfaceTopologyNode[],
  ): SurfaceTopologyNode[] | undefined {
    const node = this.node(current);
    if (!node) return;
    if (visited.has(current)) return;
    visited.add(current);
    route.push(node);
    if (current === target) return [...route];
    for (const edge of this.adjacency(current)) {
      const next = this.pathFrom(edge.to, target, visited, route);
      if (next) return next;
    }
    route.pop();
    return undefined;
  }

  toEdgeMap(): EdgeIndexMap {
    const index: EdgeIndexMap = {};
    for (const edge of this.edges) {
      const key = identityEdgeKey(edge.from, edge.to);
      index[key] = [...(index[key] ?? []), edge];
    }
    return index;
  }

  toPlanSteps(): readonly PlanStep[] {
    const nodes = [...this.#nodes.keys()];
    return nodes.map((node, index) => [node, ...nodes.slice(index + 1)] as PlanStep);
  }

  orderByWeight(): readonly SurfaceNodeId[] {
    const edges = [...this.#edges.values()].flat().toSorted((left, right) => right.weight - left.weight);
    return dedupeNodeOrder(edges.map((edge) => [edge.from, edge.to]).flat() as readonly SurfaceNodeId[]);
  }

  get edges(): readonly SurfaceEdge[] {
    return [...this.#edges.values()].flat();
  }

  diagnostics(): readonly string[] {
    return this.orderByWeight().map((nodeId) => `${nodeId}:score:${this.adjacency(nodeId).length}`);
  }
}

export const dedupeNodeOrder = <TNodes extends readonly SurfaceNodeId[]>(nodes: NoInfer<TNodes>): readonly SurfaceNodeId[] => {
  const seen = new Set<SurfaceNodeId>();
  const unique: SurfaceNodeId[] = [];
  for (const node of nodes) {
    if (!seen.has(node)) {
      seen.add(node);
      unique.push(node);
    }
  }
  return unique;
};

export const planFromPluginIds = (
  workspaceId: SurfaceWorkspaceId,
  laneIds: readonly SurfacePluginId[],
): SurfaceTopologyManifest => {
  const base = Date.now();
  const nodes: SurfaceTopologyNode[] = laneIds.map((laneId, index) => ({
    id: `${workspaceId}:node:${index}` as SurfaceNodeId,
    workspaceId,
    label: `Lane ${index}`,
    tags: ['synthetic', laneId],
    createdAt: base + index * 50,
  }));

  const edges: SurfaceEdge[] = laneIds.flatMap((laneId, index) => [
    {
      from: `${workspaceId}:node:${index}` as SurfaceNodeId,
      to: `${workspaceId}:node:${index + 1}` as SurfaceNodeId,
      weight: Math.max(1, index % 10),
      lane: index % 2 === 0 ? 'simulate' : 'score',
    },
    {
      from: `${workspaceId}:node:${index}` as SurfaceNodeId,
      to: `${workspaceId}:signal:${index}` as SurfaceNodeId,
      weight: Math.max(1, (laneId.length % 10) + 1),
      lane: 'ingest',
    },
  ]);

  return {
    workspaceId,
    nodes,
    edges,
  };
};

export const pathToString = (path: readonly SurfaceNodeId[]): string =>
  path.map((node) => node).join(',');

export const pluginNodePath = (workspaceId: SurfaceWorkspaceId, pluginId: SurfacePluginId): SurfaceNodePath<['workspace', string]> =>
  `${workspaceId}/plugin/${pluginId}` as SurfaceNodePath<['workspace', string]>;

export const parsePath = (
  path: SurfaceNodePath<['workspace', string]>,
): { workspace: SurfaceWorkspaceId; plugin: SurfacePluginId } => {
  const [workspace, plugin] = path.split('/');
  return {
    workspace: workspace as SurfaceWorkspaceId,
    plugin: `${plugin}` as SurfacePluginId,
  };
};
