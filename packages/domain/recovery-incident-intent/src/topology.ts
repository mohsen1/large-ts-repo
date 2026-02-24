import {
  type IncidentIntentEdge,
  type IncidentIntentNode,
  type IncidentIntentPhasePlan,
  type IntentNodeId,
  type IntentStatus,
  type IntentPhase,
  type IntentRunId,
  type IncidentTenantId,
  createIntentRunId,
} from './types';

export interface IntentTopologyInput {
  readonly tenantId: IncidentTenantId;
  readonly runId: IntentRunId;
  readonly nodes: readonly IncidentIntentNode[];
  readonly edges: readonly IncidentIntentEdge[];
}

export interface TopologyStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly maxDepth: number;
  readonly cycles: readonly IntentNodeId[];
}

export interface PathEvaluation {
  readonly path: readonly string[];
  readonly labels: readonly string[];
  readonly length: number;
}

const toIterator = <T>(values: Iterable<T>): IterableIterator<T> => {
  const iterator = values[Symbol.iterator]();
  const wrapped: IterableIterator<T> = {
    next: () => iterator.next(),
    [Symbol.iterator](): IterableIterator<T> {
      return wrapped;
    },
  };
  return wrapped;
};

const iterateDistinct = <T>(values: Iterable<T>): readonly T[] => {
  const seen = new Set<T>();
  const output: T[] = [];
  for (const value of toIterator(values)) {
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
};

const classifyNodeKind = (kind: IncidentIntentNode['kind']): number => {
  switch (kind) {
    case 'collect':
      return 1;
    case 'infer':
      return 2;
    case 'synthesize':
      return 3;
    case 'mitigate':
      return 4;
    case 'validate':
      return 5;
    case 'verify':
      return 6;
    default:
      return 0;
  }
};

export class IntentTopologyGraph {
  readonly #nodes = new Map<IntentNodeId, IncidentIntentNode>();
  readonly #edges = new Map<IntentNodeId, Set<IntentNodeId>>();

  constructor(input?: IntentTopologyInput) {
    if (!input) return;
    for (const node of input.nodes) this.upsertNode(node);
    for (const edge of input.edges) this.upsertEdge(edge);
  }

  getNodes(): readonly IncidentIntentNode[] {
    return [...this.#nodes.values()];
  }

  upsertNode(node: IncidentIntentNode): void {
    this.#nodes.set(node.id, node);
  }

  upsertEdge(edge: IncidentIntentEdge): void {
    const current = this.#edges.get(edge.from) ?? new Set<IntentNodeId>();
    current.add(edge.to);
    this.#edges.set(edge.from, current);
  }

  getNode(nodeId: IntentNodeId): IncidentIntentNode | undefined {
    return this.#nodes.get(nodeId);
  }

  getChildren(nodeId: IntentNodeId): readonly IntentNodeId[] {
    return [...(this.#edges.get(nodeId) ?? new Set())].toSorted();
  }

  hasNode(nodeId: IntentNodeId): boolean {
    return this.#nodes.has(nodeId);
  }

  walk(start: IntentNodeId): readonly IntentNodeId[] {
    const queue: IntentNodeId[] = [start];
    const seen = new Set<IntentNodeId>([start]);
    const order: IntentNodeId[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      order.push(current);
      const children = iterateDistinct(this.#edges.get(current) ?? []);
      for (const child of children) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
        }
      }
    }
    return order;
  }

  routeFrom(start: IntentNodeId, limit = 10): PathEvaluation {
    const walk = this.walk(start);
    const labels = walk
      .map((nodeId) => this.getNode(nodeId)?.description ?? String(nodeId))
      .toSorted((left, right) => left.localeCompare(right))
      .slice(0, limit);
    return {
      path: [...walk].map((nodeId) => String(nodeId)),
      labels,
      length: walk.length,
    };
  }

  findCycles(): readonly IntentNodeId[] {
    const visited = new Set<IntentNodeId>();
    const inStack = new Set<IntentNodeId>();
    const cycles: IntentNodeId[] = [];
    const visit = (nodeId: IntentNodeId): void => {
      if (inStack.has(nodeId)) {
        cycles.push(nodeId);
        return;
      }
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const next of this.#edges.get(nodeId) ?? []) {
        visit(next);
      }
      inStack.delete(nodeId);
    };
    for (const nodeId of this.#nodes.keys()) visit(nodeId);
    return [...new Set(cycles)];
  }

  getSnapshot(): TopologyStats {
    const nodeCount = this.#nodes.size;
    const edgeCount = [...this.#edges.values()].reduce((acc, set) => acc + set.size, 0);
    const layers = this.getNodesByRank();
    const maxDepth = layers.length === 0 ? 0 : Math.max(...layers.map((bucket) => bucket.length));
    return {
      nodeCount,
      edgeCount,
      maxDepth,
      cycles: this.findCycles(),
    };
  }

  getNodesByRank(): readonly (readonly IncidentIntentNode[])[] {
    const nodes = [...this.#nodes.values()].toSorted((left, right) => classifyNodeKind(left.kind) - classifyNodeKind(right.kind));
    return [nodes];
  }

  toPlan<TInput, TOutput>(input: TInput, status: IntentStatus, initialPhase: IntentPhase = 'analysis'):
    | IncidentIntentPhasePlan<TInput, TOutput>
    | IncidentIntentPhasePlan
  {
    const node = this.#nodes.values().next().value;
    return {
      phase: initialPhase,
      input,
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      ...(node ? { output: undefined as never } : {}),
    };
  }
}

export const normalizeTopology = (graph: IntentTopologyGraph): TopologyStats => graph.getSnapshot();

export const inferDepth = (route: readonly string[]): number => route.length === 0 ? 0 : route.length + 1;
export const isPathSafe = (route: readonly string[], maxDepth: number): boolean => inferDepth(route) <= maxDepth;

export const topologyStatsTuple = <T extends readonly unknown[]>(
  stats: readonly [IntentTopologyGraph, ...T],
): readonly [TopologyStats, ...T] => {
  const [graph, ...rest] = stats;
  return [graph.getSnapshot(), ...(rest as T)];
};

export interface TopologyCursor {
  readonly index: number;
  readonly path: readonly string[];
  readonly visited: ReadonlySet<IntentNodeId>;
}
