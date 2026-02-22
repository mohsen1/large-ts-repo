export interface Node {
  id: string;
  name: string;
  kind: string;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  relation: string;
}

export interface RuleGraph {
  nodes: Map<string, Node>;
  edges: Edge[];
}

export function newGraph(): RuleGraph {
  return { nodes: new Map(), edges: [] };
}

export function addNode(graph: RuleGraph, node: Node): void {
  graph.nodes.set(node.id, node);
}

export function addEdge(graph: RuleGraph, edge: Edge): void {
  graph.edges.push(edge);
}

export function walk(graph: RuleGraph, from: string): string[] {
  const out: string[] = [];
  for (const edge of graph.edges) {
    if (edge.from === from) out.push(edge.to);
  }
  return out;
}
