import { RuleGraph, addEdge, addNode, newGraph } from './graph';
import { evaluate } from './engine';

export interface EdgePolicy {
  graph: RuleGraph;
}

export function buildPolicy(entries: readonly [string, string, string][]): EdgePolicy {
  const graph = newGraph();
  for (const [from, relation, to] of entries) {
    if (!graph.nodes.has(from)) addNode(graph, { id: from, name: from, kind: 'node' });
    if (!graph.nodes.has(to)) addNode(graph, { id: to, name: to, kind: 'node' });
    addEdge(graph, { id: `${from}->${to}`, from, to, relation });
  }
  return { graph };
}

export function check(policy: EdgePolicy, facts: Record<string, unknown>, start: string): boolean {
  return evaluate(policy.graph, facts, start).matched;
}

export function snapshot(policy: EdgePolicy): string {
  return JSON.stringify({ nodes: [...policy.graph.nodes.keys()], edges: policy.graph.edges });
}
