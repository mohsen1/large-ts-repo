import { DomainGraph } from './builder';
import { NodeId } from './schema';

export class Traversal {
  constructor(private readonly graph: DomainGraph) {}

  allPaths(from: NodeId, to: NodeId, maxSteps: number): NodeId[][] {
    const results: NodeId[][] = [];
    const dfs = (current: NodeId, target: NodeId, seen: NodeId[], remaining: number) => {
      if (remaining < 0) return;
      if (current === target) {
        results.push([...seen]);
        return;
      }
      if (seen.length > maxSteps) return;
      for (const next of this.graph.neighbors(current).map((node) => node.id)) {
        if (!seen.includes(next)) {
          seen.push(next);
          dfs(next, target, seen, remaining - 1);
          seen.pop();
        }
      }
    };

    dfs(from, to, [from], maxSteps);
    return results;
  }

  stronglyConnected(): NodeId[][] {
    const nodes = this.graph.nodes.map((node) => node.id);
    const matrix = nodes.map((start) =>
      nodes.map((end) => this.allPaths(start, end, 4).length > 0),
    );
    const out: NodeId[][] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const bucket: NodeId[] = [];
      for (let j = 0; j < nodes.length; j += 1) {
        if (matrix[i][j]) bucket.push(nodes[j]);
      }
      out.push([nodes[i], ...bucket]);
    }
    return out;
  }
}
