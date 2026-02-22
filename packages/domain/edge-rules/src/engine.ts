import { RuleGraph } from './graph';

export interface Fact {
  key: string;
  value: unknown;
}

export interface MatchResult {
  path: string[];
  matched: boolean;
}

export function evaluate(graph: RuleGraph, facts: Record<string, unknown>, start: string): MatchResult {
  const visited = new Set<string>();
  const path: string[] = [start];
  const stack = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    const next = graph.edges.filter((edge) => edge.from === node);
    for (const edge of next) {
      if (facts[edge.relation] !== undefined) {
        path.push(edge.to);
        stack.push(edge.to);
      }
    }
  }
  return { path, matched: path.length > 1 };
}
