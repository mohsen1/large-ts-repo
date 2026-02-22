import type { DecisionPolicyTemplate } from '@data/decision-catalog';

export interface PolicyExecutionGraph {
  templateId: string;
  executionOrder: string[];
  edges: ReadonlyArray<{ from: string; to: string }>;
}

export function buildExecutionGraph(template: DecisionPolicyTemplate): PolicyExecutionGraph {
  const deps = new Map<string, Set<string>>();
  const outgoing = new Set(`${template.id}`);

  for (const node of template.nodes) {
    deps.set(node.id, new Set());
  }

  for (const edge of template.edges) {
    const target = deps.get(edge.to);
    if (target) {
      target.add(edge.from);
    }
  }

  const order: string[] = [];
  const ready = [...deps.entries()].filter(([, incoming]) => incoming.size === 0).map(([id]) => id);
  const seen = new Set<string>(ready);

  for (const current of ready) {
    order.push(current);
    for (const edge of template.edges.filter((item) => item.from === current)) {
      const nextDeps = deps.get(edge.to);
      if (!nextDeps) continue;
      nextDeps.delete(current);
      if (nextDeps.size === 0 && !seen.has(edge.to)) {
        seen.add(edge.to);
        order.push(edge.to);
      }
    }
  }

  return { templateId: template.id, executionOrder: order, edges: template.edges };
}
