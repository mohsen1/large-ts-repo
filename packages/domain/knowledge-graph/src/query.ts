import { DomainGraph } from './builder';
import { NodeId } from './schema';

export interface QueryInput {
  root: NodeId;
  maxDepth: number;
  includeMetadata: boolean;
}

export type TraversalStep = { nodeId: NodeId; depth: number };

export interface QueryResult {
  nodes: NodeId[];
  edges: Array<{ from: NodeId; to: NodeId }>; 
  depth: number;
}

export function runQuery(graph: DomainGraph, input: QueryInput): QueryResult {
  const outNodes: NodeId[] = [];
  const outEdges: Array<{ from: NodeId; to: NodeId }> = [];

  const queue: TraversalStep[] = [{ nodeId: input.root, depth: 0 }];
  const seen = new Set<NodeId>([input.root]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    outNodes.push(current.nodeId);
    if (current.depth >= input.maxDepth) continue;
    for (const neighbor of graph.neighbors(current.nodeId)) {
      outEdges.push({ from: current.nodeId, to: neighbor.id });
      if (!seen.has(neighbor.id)) {
        seen.add(neighbor.id);
        queue.push({ nodeId: neighbor.id, depth: current.depth + 1 });
      }
    }
  }

  return {
    nodes: outNodes,
    edges: outEdges,
    depth: input.maxDepth,
  };
}

export async function explain(graph: DomainGraph, input: QueryInput): Promise<QueryResult> {
  await Promise.resolve();
  return runQuery(graph, input);
}
