import { DomainGraph } from '@domain/knowledge-graph/builder';
import { runQuery, QueryInput } from '@domain/knowledge-graph/query';

export interface GraphMetrics {
  reach: number;
  breadth: number;
  density: number;
}

export function metrics(graph: DomainGraph, input: QueryInput): GraphMetrics {
  const result = runQuery(graph, input);
  const reach = result.nodes.length;
  const breadth = input.maxDepth === 0 ? 0 : result.edges.length / Math.max(input.maxDepth, 1);
  const density = graph.nodes.length ? result.edges.length / graph.nodes.length : 0;
  return { reach, breadth, density };
}

export function planBatches(graph: DomainGraph, chunkSize: number): string[][] {
  const ids = graph.nodes.map((node) => node.id);
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    out.push(ids.slice(i, i + chunkSize));
  }
  return out;
}
