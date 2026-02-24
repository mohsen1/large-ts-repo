import { STAGE_ORDER_MAP, type PlaybookEdge, type PlaybookGraph, type PlaybookNode, type PluginState } from './types';

export interface PlaybookGraphVisitor {
  enter(node: PlaybookNode): void;
  exit(node: PlaybookNode): void;
}

export interface GraphTopologyOptions {
  readonly includeOrphanNodes: boolean;
  readonly allowCycles: boolean;
}

export interface StageTopology {
  readonly phase: PluginState;
  readonly nodes: readonly PlaybookNode[];
  readonly sequence: readonly string[];
}

export class StageGraph {
  readonly #nodes: Map<string, PlaybookNode>;
  readonly #edges: Map<string, readonly PlaybookEdge[]>;

  constructor(
    graph: PlaybookGraph,
    private readonly options: GraphTopologyOptions = { includeOrphanNodes: true, allowCycles: false },
  ) {
    this.#nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const buckets = new Map<string, PlaybookEdge[]>();
    for (const edge of graph.edges) {
      const list = buckets.get(edge.from) ?? [];
      buckets.set(edge.from, [...list, edge]);
    }
    this.#edges = buckets;
  }

  get nodeCount(): number {
    return this.#nodes.size;
  }

  toAdjacencyMatrix(): readonly (readonly number[])[] {
    const nodes = [...this.#nodes.keys()].toSorted((left, right) => {
      const leftNode = this.#nodes.get(left);
      const rightNode = this.#nodes.get(right);
      if (!leftNode || !rightNode) return 0;
      return STAGE_ORDER_MAP[leftNode.phase] - STAGE_ORDER_MAP[rightNode.phase];
    });
    const matrix: number[][] = nodes.map(() => new Array(nodes.length).fill(0));
    const indexById = new Map(nodes.map((node, index) => [node, index] as const));

    for (const [from, edges] of this.#edges) {
      const fromIndex = indexById.get(from);
      if (typeof fromIndex !== 'number') continue;
      for (const edge of edges) {
        const toIndex = indexById.get(edge.to);
        if (typeof toIndex === 'number') {
          matrix[fromIndex]![toIndex] = edge.affinity;
        }
      }
    }

    return matrix;
  }

  get stages(): readonly PlaybookNode[] {
    return [...this.#nodes.values()].toSorted((left, right) => STAGE_ORDER_MAP[left.phase] - STAGE_ORDER_MAP[right.phase]);
  }

  listByStage(phase: PluginState): readonly PlaybookNode[] {
    return this.stages.filter((node) => node.phase === phase);
  }

  listDisconnectedNodes(): readonly PlaybookNode[] {
    const linkedNodes = new Set<string>();
    for (const [from, edges] of this.#edges) {
      linkedNodes.add(from);
      for (const edge of edges) linkedNodes.add(edge.to);
    }
    return [...this.#nodes.values()].filter((node) => !linkedNodes.has(node.id));
  }

  buildRoute(plan: readonly string[]): readonly PlaybookNode[] {
    const stack = [...plan];
    const output: PlaybookNode[] = [];
    while (stack.length > 0) {
      const nextId = stack.shift();
      if (!nextId) continue;
      const node = this.#nodes.get(nextId);
      if (node) {
        output.push(node);
      }
      const edges = this.#edges.get(nextId) ?? [];
      for (const edge of edges) {
        if (!plan.includes(edge.to)) {
          stack.push(edge.to);
        }
      }
    }
    return [...new Map(output.map((node) => [node.id, node])).values()];
  }

  resolveExecutionPath(startNode: string): readonly PlaybookNode[] {
    const seen = new Set<string>();
    const ordered: PlaybookNode[] = [];
    const stack: string[] = [startNode];

    while (stack.length > 0) {
      const currentId = stack.shift();
      if (!currentId || seen.has(currentId)) continue;
      seen.add(currentId);
      const current = this.#nodes.get(currentId);
      if (!current) continue;
      ordered.push(current);
      const outgoing = this.#edges.get(currentId);
      if (!outgoing) continue;

      for (const edge of outgoing.toSorted((a, b) => b.affinity - a.affinity)) {
        if (this.options.allowCycles) {
          stack.push(edge.to);
          continue;
        }
        if (!seen.has(edge.to)) {
          stack.push(edge.to);
        }
      }
    }

    return ordered;
  }

  walk(nodeIds: Iterable<string>): readonly PlaybookNode[] {
    const nodes = new Set<string>(nodeIds);
    const adjacency: [string, string][] = [];
    for (const [from, edges] of this.#edges) {
      for (const edge of edges) {
        if (nodes.has(from)) {
          adjacency.push([from, edge.to]);
        }
      }
    }

    const visit = (id: string, seen: Set<string>, path: string[]): string[] => {
      if (seen.has(id)) return path;
      seen.add(id);
      const next = adjacency
        .filter(([from]) => from === id)
        .map(([, to]) => to)
        .toSorted();
      const childPaths = next.flatMap((entry) => visit(entry, seen, [...path, entry]));
      return [...path, ...childPaths];
    };

    const raw = [...nodes].flatMap((id) => visit(id, new Set(), [id]));
    const order: PlaybookNode[] = [];
    const seen = new Set<string>();
    for (const id of raw) {
      if (seen.has(id)) continue;
      const node = this.#nodes.get(id);
      if (node) {
        seen.add(id);
        order.push(node);
      }
    }
    return order;
  }

  summarize(): readonly StageTopology[] {
    const byPhase = new Map<PluginState, PlaybookNode[]>();
    for (const node of this.stages) {
      const list = byPhase.get(node.phase) ?? [];
      byPhase.set(node.phase, [...list, node]);
    }

    return [...byPhase.entries()].map(([phase, nodes]) => {
      const sequence = nodes
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .map((node) => node.id);
      return {
        phase,
        nodes: nodes.toSorted((left, right) => left.name.localeCompare(right.name)),
        sequence,
      };
    });
  }

  visitDepthFirst(visitor: PlaybookGraphVisitor): void {
    const seen = new Set<string>();
    const walkNode = (nodeId: string): void => {
      const node = this.#nodes.get(nodeId);
      if (!node || seen.has(nodeId)) return;
      seen.add(nodeId);
      visitor.enter(node);
      for (const edge of (this.#edges.get(nodeId) ?? []).toSorted((left, right) => right.affinity - left.affinity)) {
        walkNode(edge.to);
      }
      visitor.exit(node);
    };

    if (this.options.includeOrphanNodes) {
      for (const id of this.#nodes.keys()) {
        walkNode(id);
      }
    } else {
      for (const [id, edges] of this.#edges) {
        if (edges.length > 0) {
          walkNode(id);
        }
      }
    }
  }
}
