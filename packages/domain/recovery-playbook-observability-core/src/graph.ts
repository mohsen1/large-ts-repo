import { withBrand } from '@shared/core';
import {
  type ObservabilityPlaybookId,
  type ObservabilityRunId,
  type ObservabilitySignalId,
  type ObservabilityScope,
} from './identity';

export const graphKinds = ['timeline', 'dependency', 'incident', 'policy', 'workflow'] as const;
export type GraphKind = (typeof graphKinds)[number];
export type GraphKindPrefix<T extends string> = `${T}::${string}`;

export type GraphNodeId<TScope extends string = string> = `${TScope}:${string}`;
export type GraphEdgeKind<TKind extends GraphKind = GraphKind> = `${TKind}:${string}`;

export interface ObservabilityNodeState {
  readonly stateful: boolean;
  readonly severity: 0 | 1 | 2 | 3 | 4 | 5;
  readonly score: number;
}

export interface ObservabilityGraphNode<TScope extends ObservabilityScope = ObservabilityScope> {
  readonly id: GraphNodeId<TScope>;
  readonly playbookId: ObservabilityPlaybookId;
  readonly scope: TScope;
  readonly kind: GraphKind;
  readonly label: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly state: ObservabilityNodeState;
}

export interface ObservabilityGraphEdge {
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  readonly kind: GraphKind;
  readonly weight: number;
  readonly reason: string;
}

export type NodeIdOf<T extends ObservabilityGraphNode> = T['id'];
export type EdgeKey<TNode extends GraphNodeId = GraphNodeId> = `${TNode}->${TNode}`;

export type NodeByScope<TNodes extends readonly ObservabilityGraphNode[]> = {
  [Node in TNodes[number] as Node['scope']]: readonly Extract<TNodes[number], { scope: Node['scope'] }>[];
};

export type WeightedPath<TPath extends readonly GraphNodeId[]> = TPath extends readonly [
  infer Head extends GraphNodeId,
  ...infer Rest extends readonly GraphNodeId[],
]
  ? readonly [[Head, ...Rest], number]
  : readonly [readonly GraphNodeId[], number];

export interface GraphSnapshot {
  readonly nodes: readonly ObservabilityGraphNode[];
  readonly edges: readonly ObservabilityGraphEdge[];
  readonly runId: ObservabilityRunId;
  readonly version: string;
}

const isEdgeKey = (value: string): value is EdgeKey => value.includes('->');

export const buildEdgeKey = (from: GraphNodeId, to: GraphNodeId): EdgeKey => `${from}->${to}` as EdgeKey;

const ensureGraphNodeId = (value: string): GraphNodeId => {
  if (value.length === 0 || !value.includes(':')) {
    throw new Error(`invalid graph node id: ${value}`);
  }
  return value as GraphNodeId;
};

export const parseEdgeKey = (key: EdgeKey): [GraphNodeId, GraphNodeId] => {
  if (!isEdgeKey(key)) {
    throw new Error(`invalid edge key: ${key}`);
  }
  const [from, to] = key.split('->', 2);
  return [ensureGraphNodeId(from), ensureGraphNodeId(to)];
};

const parseScopeFromNodeId = (nodeId: GraphNodeId): ObservabilityScope => {
  const [scope] = nodeId.split(':', 2);
  return scope as ObservabilityScope;
};

const toSorted = <T extends string>(values: readonly T[]): readonly T[] => [...values].sort((a, b) => a.localeCompare(b));

export class ObservabilityTopology {
  readonly #nodes = new Map<GraphNodeId, ObservabilityGraphNode>();
  readonly #edges = new Map<EdgeKey, ObservabilityGraphEdge>();
  readonly #adjacency = new Map<GraphNodeId, Set<GraphNodeId>>();

  addNode(node: ObservabilityGraphNode): void {
    this.#nodes.set(node.id, node);
    if (!this.#adjacency.has(node.id)) {
      this.#adjacency.set(node.id, new Set());
    }
  }

  addEdge(edge: ObservabilityGraphEdge): void {
    const fromNode = this.requireNode(edge.from);
    const toNode = this.#nodes.get(edge.to) ?? this.requireNodeOrCreate(edge.to, fromNode.scope, edge.kind);

    this.#edges.set(buildEdgeKey(edge.from, edge.to), edge);
    const bucket = this.#adjacency.get(edge.from) ?? new Set();
    bucket.add(edge.to);
    this.#adjacency.set(edge.from, bucket);

    if (!this.#nodes.has(edge.to)) {
      this.addNode(toNode);
    }
  }

  requireNode(nodeId: GraphNodeId): ObservabilityGraphNode {
    const node = this.#nodes.get(nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }
    return node;
  }

  private requireNodeOrCreate(nodeId: GraphNodeId, scope: ObservabilityScope, kind: GraphKind): ObservabilityGraphNode {
    const safeScope = scope as string;
    return {
      id: nodeId as GraphNodeId<ObservabilityScope>,
      playbookId: withBrand(`playbook:${safeScope}:${nodeId}`, 'ObservabilityPlaybookId'),
      scope: scope,
      kind,
      label: `${scope}:${nodeId}`,
      tags: ['inbound', safeScope] as const,
      createdAt: new Date().toISOString(),
      state: {
        stateful: true,
        severity: 1,
        score: 1,
      },
    };
  }

  hasNode(nodeId: GraphNodeId): boolean {
    return this.#nodes.has(nodeId);
  }

  listNodes(): readonly ObservabilityGraphNode[] {
    return [...this.#nodes.values()];
  }

  listEdges(): readonly ObservabilityGraphEdge[] {
    return [...this.#edges.values()];
  }

  listNeighbors(nodeId: GraphNodeId): readonly GraphNodeId[] {
    const neighbors = this.#adjacency.get(nodeId);
    return neighbors ? [...neighbors] : [];
  }

  findReachable(start: GraphNodeId, maxDepth = 20): readonly GraphNodeId[] {
    const seen = new Set<GraphNodeId>();
    const queue: Array<{ nodeId: GraphNodeId; depth: number }> = [{ nodeId: start, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const { nodeId, depth } = current;
      if (seen.has(nodeId) || depth > maxDepth) {
        continue;
      }
      seen.add(nodeId);
      for (const neighbor of this.listNeighbors(nodeId)) {
        queue.push({ nodeId: neighbor, depth: depth + 1 });
      }
    }

    return [...seen];
  }

  *paths(start: GraphNodeId, maxDepth = 8): IterableIterator<readonly GraphNodeId[]> {
    const seen = new Set<GraphNodeId>();
    const nextNodes = (value: GraphNodeId): readonly GraphNodeId[] => this.listNeighbors(value);

    const walk = function* (
      nodeId: GraphNodeId,
      trail: readonly GraphNodeId[],
      depth: number,
    ): IterableIterator<readonly GraphNodeId[]> {
      if (depth > maxDepth || seen.has(nodeId)) {
        return;
      }
      seen.add(nodeId);
      const next = [...trail, nodeId];
      if (depth > 0) {
        yield next;
      }
      for (const neighbor of nextNodes(nodeId)) {
        yield* walk(neighbor, next, depth + 1);
      }
      seen.delete(nodeId);
    };

    yield* walk(start, [], 0);
  }

  snapshot(runId: ObservabilityRunId, version = 'v1'): GraphSnapshot {
    return {
      nodes: this.listNodes(),
      edges: this.listEdges(),
      runId,
      version,
    };
  }

  toAdjacencyMatrix(): ReadonlyMap<EdgeKey, Readonly<Record<string, unknown>>> {
    const matrix = new Map<EdgeKey, Record<string, unknown>>();
    for (const edge of this.#edges.values()) {
      matrix.set(buildEdgeKey(edge.from, edge.to), {
        kind: edge.kind,
        weight: edge.weight,
        reason: edge.reason,
        fromScope: parseScopeFromNodeId(edge.from),
        toScope: parseScopeFromNodeId(edge.to),
      });
    }
    return matrix;
  }

  sortBySeverity(): readonly ObservabilityGraphNode[] {
    return toSorted(this.listNodes().map((node) => node.id)).flatMap((nodeId) => [this.requireNode(nodeId)]);
  }

  getSignalsByScope(scope: ObservabilityScope): readonly ObservabilitySignalId[] {
    return this.listNodes()
      .filter((node) => node.scope === scope)
      .map((node) => withBrand(node.id, 'ObservabilitySignalId'));
  }
}

export const buildTopologyDigest = (topology: ObservabilityTopology): string => {
  const nodes = topology.listNodes().map((node) => node.id);
  const edges = topology.listEdges().map((edge) => buildEdgeKey(edge.from, edge.to));
  const signature = `${nodes.length}x${edges.length}`;
  const scopeBuckets = nodes.reduce<Record<string, number>>((acc, nodeId) => {
    const [scope] = nodeId.split(':', 2);
    if (!scope) return acc;
    acc[scope] = (acc[scope] ?? 0) + 1;
    return acc;
  }, {});

  const summary = [...Object.entries(scopeBuckets)]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}=${count}`)
    .join(',');

  return `${signature}|${summary}`;
};
