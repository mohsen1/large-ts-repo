import { type PlaybookAutomationRunId, type StageId, type StagePlan, type PlaybookPhase } from './models';

export interface PlaybookGraphEdge {
  from: StageId;
  to: StageId;
  weight: number;
}

export interface PlaybookGraphInput {
  readonly runId: PlaybookAutomationRunId;
  readonly steps: readonly StagePlan[];
  readonly dependencies: readonly PlaybookGraphEdge[];
}

export interface GraphEnvelope {
  readonly vertexCount: number;
  readonly edgeCount: number;
}

export type GraphPath<TNode extends string, TDepth extends number, TAcc extends readonly string[] = []> =
  TAcc['length'] extends TDepth
    ? { from: TNode; path: readonly [...TAcc] }
    : never;

export class PlaybookDependencyGraph {
  private readonly adjacency = new Map<StageId, Set<StageId>>();

  constructor(input: Readonly<PlaybookGraphInput>) {
    for (const step of input.steps) {
      if (!this.adjacency.has(step.id)) {
        this.adjacency.set(step.id, new Set());
      }
    }

    for (const edge of input.dependencies) {
      const bag = this.adjacency.get(edge.from);
      bag?.add(edge.to);
    }
  }

  *edges(): IterableIterator<PlaybookGraphEdge> {
    for (const [from, toSet] of this.adjacency) {
      for (const to of toSet) {
        yield { from, to, weight: 1 };
      }
    }
  }

  toEnvelope(): GraphEnvelope {
    const vertexCount = this.adjacency.size;
    const edgeCount = [...this.adjacency.values()].reduce((sum, outgoing) => sum + outgoing.size, 0);
    return { vertexCount, edgeCount };
  }

  order(): readonly StageId[] {
    const indeg = new Map<StageId, number>();
    for (const stage of this.adjacency.keys()) {
      indeg.set(stage, 0);
    }

    for (const [from, outs] of this.adjacency) {
      for (const to of outs) {
        indeg.set(to, (indeg.get(to) ?? 0) + 1);
        if (!indeg.has(from)) indeg.set(from, 0);
      }
    }

    const queue: StageId[] = [...indeg.entries()]
      .filter(([, count]) => count === 0)
      .map(([id]) => id);

    const sorted: StageId[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      sorted.push(current);
      for (const to of this.adjacency.get(current) ?? new Set()) {
        const next = indeg.get(to);
        if (next === undefined) continue;
        const updated = next - 1;
        if (updated <= 0) queue.push(to);
        indeg.set(to, updated);
      }
    }

    return sorted;
  }

  *pathsFrom(start: StageId, maxDepth = 12): IterableIterator<readonly StageId[]> {
    const adjacency = this.adjacency;
    const walk = function* (node: StageId, seen: StageId[], depth: number): Generator<readonly StageId[]> {
      if (depth > maxDepth) return;
      const outgoing = [...(adjacency.get(node) ?? new Set())];
      if (outgoing.length === 0) {
        yield [...seen, node];
        return;
      }

      for (const target of outgoing) {
        if (seen.includes(target)) continue;
        yield* walk(target, [...seen, node], depth + 1);
      }
    };

    yield* walk(start, [], 0);
  }

  pathTo(target: StageId, limit = 50): PlaybookGraphEdge[] {
    const phasePrefix: PlaybookPhase[] = ['initialized', 'enqueued', 'simulated', 'executing', 'audited', 'finished'];
    const edges = [...this.edges()];
    const index = new Set<PlaybookGraphEdge['to']>([target]);
    const output = edges.filter((edge) => index.has(edge.from) || index.has(edge.to));

    if (edges.length === 0) {
      return [];
    }

    return output.slice(0, Math.max(1, Math.min(limit, output.length)));
  }
}

export const routeFromGraph = (graph: PlaybookDependencyGraph): readonly GraphPath<string, 6>[] => {
  const edges = [...graph.edges()];
  const mapped: GraphPath<string, 6>[] = [];
  for (const edge of edges) {
    mapped.push({ from: edge.from, path: [edge.from, edge.to] } as GraphPath<string, 6>);
  }
  return mapped;
};
