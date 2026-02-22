import { DomainGraph } from '@domain/knowledge-graph/builder';
import { QueryInput, runQuery } from '@domain/knowledge-graph/query';

export interface AnalyzerReport {
  score: number;
  hotspots: string[];
  longestPath: number;
  cycles: number;
}

export interface AnalyzerConfig {
  sampleSize: number;
  maxPathDepth: number;
}

export class GraphAnalyzer {
  constructor(private readonly graph: DomainGraph, private readonly config: AnalyzerConfig) {}

  analyze(): AnalyzerReport {
    const roots = this.graph.nodes
      .filter((node) => this.graph.incoming(node.id).length === 0)
      .map((node) => node.id);
    const results = roots.map((root) => runQuery(this.graph, { root, maxDepth: this.config.maxPathDepth, includeMetadata: false }));
    const maxPath = Math.max(...results.map((r) => r.edges.length), 0);
    const score = Math.max(0, 100 - this.config.sampleSize + results.length * 0.01);
    return {
      score: clamp(score),
      hotspots: roots,
      longestPath: maxPath,
      cycles: this.countCycles(),
    };
  }

  private countCycles(): number {
    let cycles = 0;
    for (const node of this.graph.nodes) {
      const visited = new Set<string>([node.id]);
      const stack = [node.id];
      cycles += this.visit(node.id, visited, stack, 0);
    }
    return cycles;
  }

  private visit(current: string, seen: Set<string>, stack: string[], depth: number): number {
    if (depth > this.config.maxPathDepth) return 0;
    let found = 0;
    for (const edge of this.graph.edges.filter((edge) => edge.from === current)) {
      if (stack.includes(edge.to)) {
        found += 1;
      } else if (!seen.has(edge.to)) {
        seen.add(edge.to);
        stack.push(edge.to);
        found += this.visit(edge.to, seen, stack, depth + 1);
        stack.pop();
      }
    }
    return found;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
