import { LineageGraph, addEdge, addNode, createGraph, LineageEdge, LineageNode } from './graph';

export interface SourceEvent {
  source: string;
  target: string;
  relation: LineageEdge['relation'];
  details: Record<string, string>;
}

export class LineageCollector {
  private readonly graph: LineageGraph = createGraph();
  ingestSource(event: SourceEvent): void {
    const source: LineageNode = {
      id: event.source,
      type: 'api',
      metadata: { relation: event.relation, ...event.details },
    };
    const target: LineageNode = {
      id: event.target,
      type: 'table',
      metadata: { relation: event.relation, ...event.details },
    };
    addNode(this.graph, source);
    addNode(this.graph, target);
    addEdge(this.graph, { from: event.source, to: event.target, relation: event.relation, confidence: 1 });
  }

  ingestBulk(events: readonly SourceEvent[]): void {
    for (const event of events) this.ingestSource(event);
  }

  report(): LineageGraph {
    return this.graph;
  }
}

export function mergeLineage(graphs: readonly LineageGraph[]): LineageGraph {
  const output = createGraph();
  for (const graph of graphs) {
    for (const [id, node] of graph.nodes.entries()) {
      output.nodes.set(id, node);
    }
    for (const edge of graph.edges) {
      output.edges.push(edge);
    }
  }
  return output;
}
