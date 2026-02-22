import type { DirectiveId, ReadinessDirective, ReadinessDirectiveChain } from './types';

export interface ReadinessDependencyEdge {
  from: ReadinessDirective['directiveId'];
  to: ReadinessDirective['directiveId'];
}

export interface DependencyContext {
  edges: ReadinessDependencyEdge[];
  allowParallelism: boolean;
}

export interface ReadinessDependencyError {
  kind: 'cycle' | 'missing-node' | 'self-loop';
  detail: string;
}

export function normalizeDirectives(directives: readonly ReadinessDirective[]): ReadinessDirectiveChain<ReadinessDirective> {
  const nodes = [...directives];
  const adjacency = directives.reduce<Record<string, DirectiveId[]>>((acc, directive) => {
    acc[directive.directiveId] = directive.dependsOn
      .map((dependency) => dependency.directiveId)
      .filter((dependency) => directives.some((candidate) => candidate.directiveId === dependency));
    return acc;
  }, {});

  return {
    nodes,
    adjacency
  };
}

export function topologicalExecutionOrder(directives: readonly ReadinessDirective[]): {
  order: ReadinessDirective[];
  stages: ReadinessDirective[][];
  errors: ReadinessDependencyError[];
} {
  const chain = normalizeDirectives(directives);
  const indegree = new Map<string, number>();
  for (const node of chain.nodes) {
    indegree.set(node.directiveId, 0);
  }

  for (const [from, dependencies] of Object.entries(chain.adjacency)) {
    for (const dependency of dependencies) {
      indegree.set(from, (indegree.get(from) ?? 0) + 1);
      if (dependency === from) {
        return {
          order: [],
          stages: [],
          errors: [{ kind: 'self-loop', detail: `${from} -> ${dependency}` }],
        };
      }
      if (!indegree.has(dependency)) {
        return {
          order: [],
          stages: [],
          errors: [{ kind: 'missing-node', detail: `${from} depends on missing ${dependency}` }]
        };
      }
    }
  }

  const ready = chain.nodes.filter((directive) => (indegree.get(directive.directiveId) ?? 0) === 0).map((directive) => directive);
  const order: ReadinessDirective[] = [];
  const stages: ReadinessDirective[][] = [];

  const queue = [...ready];
  const remaining = new Map<string, ReadinessDirective>(chain.nodes.map((directive) => [directive.directiveId, directive]));

  while (queue.length > 0) {
    const stage = [...queue];
    stages.push(stage);
    queue.length = 0;

    for (const directive of stage) {
      order.push(directive);
      const dependents = chain.nodes.filter((candidate) =>
        chain.adjacency[candidate.directiveId]?.includes(directive.directiveId),
      );

      for (const dependent of dependents) {
        const previous = indegree.get(dependent.directiveId) ?? 0;
        indegree.set(dependent.directiveId, Math.max(0, previous - 1));
        if (indegree.get(dependent.directiveId) === 0) {
          queue.push(dependent);
          remaining.delete(dependent.directiveId);
        }
      }
    }

    for (const staged of stage) {
      remaining.delete(staged.directiveId);
    }
  }

  if (remaining.size > 0) {
    return {
      order,
      stages,
      errors: [{ kind: 'cycle', detail: `Unable to order directives: ${Array.from(remaining.keys()).join(',')}` }]
    };
  }

  return { order, stages, errors: [] };
}

export function canExecuteInParallel(directives: readonly ReadinessDirective[], context: DependencyContext): boolean {
  if (!context.allowParallelism) {
    return true;
  }

  const { errors, stages } = topologicalExecutionOrder(directives);
  if (errors.length > 0) {
    return false;
  }

  return stages.some((stage) => stage.length > 1);
}
