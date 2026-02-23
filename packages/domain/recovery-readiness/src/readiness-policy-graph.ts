import type { ReadinessDirective, ReadinessDirectiveChain, ReadinessWindow } from './types';
import type { ReadinessPolicy } from './policy';

export interface PolicyGraphNode {
  directiveId: ReadinessDirective['directiveId'];
  name: string;
  dependsOn: ReadinessDirective['directiveId'][];
}

export interface PolicyGraphEdge {
  from: ReadinessDirective['directiveId'];
  to: ReadinessDirective['directiveId'];
}

export interface PolicyExecutionPlan {
  policy: ReadinessPolicy;
  directedEdges: readonly PolicyGraphEdge[];
  topologicalOrder: readonly ReadinessDirective['directiveId'][];
  dependencyDepth: number;
  hasCycle: boolean;
}

const toNode = (directive: ReadinessDirective): PolicyGraphNode => ({
  directiveId: directive.directiveId,
  name: directive.name,
  dependsOn: directive.dependsOn.map((dependency) => dependency.directiveId),
});

const buildEdges = (directives: readonly ReadinessDirective[]): PolicyGraphEdge[] => {
  const edges: PolicyGraphEdge[] = [];
  for (const directive of directives) {
    for (const dependency of directive.dependsOn) {
      edges.push({ from: dependency.directiveId, to: directive.directiveId });
    }
  }
  return edges;
};

const buildAdjacency = (directives: readonly ReadinessDirective[]): Map<ReadinessDirective['directiveId'], ReadinessDirective['directiveId'][]> => {
  const map = new Map<ReadinessDirective['directiveId'], ReadinessDirective['directiveId'][]>();
  for (const directive of directives) {
    map.set(directive.directiveId, []);
  }

  for (const edge of buildEdges(directives)) {
    const next = map.get(edge.from);
    if (!next) continue;
    next.push(edge.to);
  }

  return map;
};

export const flattenPolicyChain = (chain: ReadinessDirectiveChain<ReadinessDirective>): ReadinessDirective['directiveId'][] => {
  const ordered: ReadinessDirective['directiveId'][] = [];
  const visited = new Set<string>();

  for (const node of chain.nodes) {
    if (visited.has(node.directiveId)) continue;
    for (const dependency of chain.adjacency[node.directiveId] ?? []) {
      if (!visited.has(dependency)) {
        visited.add(dependency);
        ordered.push(dependency);
      }
    }
    visited.add(node.directiveId);
    ordered.push(node.directiveId);
  }

  return ordered;
};

export const computeDirectiveDepth = (directives: readonly ReadinessDirective[]): number => {
  const adjacency = buildAdjacency(directives);
  const memo = new Map<string, number>();

  const depthOf = (current: ReadinessDirective['directiveId'], path: Set<string>): number => {
    if (memo.has(current)) {
      return memo.get(current) ?? 0;
    }
    if (path.has(current)) {
      return Number.POSITIVE_INFINITY;
    }

    path.add(current);
    const children = adjacency.get(current) ?? [];
    let next = 0;
    for (const child of children) {
      const childDepth = depthOf(child, new Set(path));
      if (childDepth === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
      next = Math.max(next, childDepth + 1);
    }
    path.delete(current);
    memo.set(current, next);
    return next;
  };

  return directives.reduce((maxDepth, directive) => Math.max(maxDepth, depthOf(directive.directiveId, new Set())), 0);
};

export const detectSelfCycle = (directives: readonly ReadinessDirective[]): boolean => {
  const lookup = new Map<ReadinessDirective['directiveId'], boolean>();
  for (const directive of directives) {
    lookup.set(
      directive.directiveId,
      directive.dependsOn.some((dependency) => dependency.directiveId === directive.directiveId),
    );
  }
  return Array.from(lookup.values()).some((found) => found);
};

export const buildPolicyGraph = (
  directives: readonly ReadinessDirective[],
  policy: ReadinessPolicy,
): PolicyExecutionPlan => {
  const directedEdges = buildEdges(directives);
  const indegree = new Map<string, number>();
  const outgoing = new Map<ReadinessDirective['directiveId'], ReadinessDirective['directiveId'][]>();

  for (const edge of directedEdges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }

  const roots: ReadinessDirective['directiveId'][] = [];
  const nodes = new Set<ReadinessDirective['directiveId']>(directives.map((directive) => directive.directiveId));

  for (const nodeId of nodes) {
    if (!indegree.has(nodeId)) {
      roots.push(nodeId);
    }
  }

  const queue = [...roots];
  const seen = new Set<ReadinessDirective['directiveId']>();
  const order: ReadinessDirective['directiveId'][] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    order.push(current);

    for (const neighbor of outgoing.get(current) ?? []) {
      const remaining = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, remaining);
      if (remaining <= 0) {
        queue.push(neighbor);
      }
    }
  }

  const hasCycle = order.length !== nodes.size || detectSelfCycle(directives);
  return {
    policy,
    directedEdges,
    topologicalOrder: order,
    dependencyDepth: computeDirectiveDepth(directives),
    hasCycle,
  };
};

export const derivePolicyWindowConflicts = (
  directives: readonly ReadinessDirective[],
  windows: readonly ReadinessWindow[],
): ReadonlyArray<ReadinessWindow> => {
  return windows.filter((window) => directives.some((directive) => directive.name.includes(window.label)));
};

export const toGraphNodes = (directives: readonly ReadinessDirective[]): PolicyGraphNode[] => directives.map(toNode);
