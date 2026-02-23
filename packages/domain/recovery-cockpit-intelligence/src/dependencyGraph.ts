import { EntityId, RecoveryAction } from '@domain/recovery-cockpit-models';

export type DependencyNode = {
  readonly id: EntityId;
  readonly action: RecoveryAction;
  readonly dependsOn: ReadonlySet<EntityId>;
  readonly dependents: ReadonlySet<EntityId>;
  readonly riskScore: number;
};

export type DependencyGraph = {
  readonly nodes: ReadonlyMap<EntityId, DependencyNode>;
  readonly rank: ReadonlyMap<EntityId, number>;
};

const computeRisk = (action: RecoveryAction): number => {
  const commandRisk = action.command.length % 10;
  const dependencyRisk = action.dependencies.length * 3;
  const retryBoost = action.retriesAllowed > 0 ? action.retriesAllowed : 0;
  return Math.min(100, commandRisk + dependencyRisk + retryBoost);
};

export const asDependencyNode = (action: RecoveryAction): DependencyNode => ({
  id: action.id,
  action,
  dependsOn: new Set(action.dependencies),
  dependents: new Set(),
  riskScore: computeRisk(action),
});

export const buildDependencyGraph = (actions: readonly RecoveryAction[]): DependencyGraph => {
  const nodes = new Map<EntityId, DependencyNode>();
  for (const action of actions) {
    nodes.set(action.id, asDependencyNode(action));
  }

  for (const node of nodes.values()) {
    for (const dependency of node.dependsOn) {
      const parent = nodes.get(dependency);
      if (!parent) continue;
      nodes.set(dependency, {
        ...parent,
        dependents: new Set([...parent.dependents, node.id]),
      });
    }
  }

  const rank = topologicalRank(nodes);
  return { nodes, rank };
};

export const buildCriticalPath = (graph: DependencyGraph): EntityId[] => {
  let maxRank = -1;
  let head: EntityId | undefined;
  for (const [id, level] of graph.rank) {
    if (level > maxRank) {
      maxRank = level;
      head = id;
    }
  }

  if (!head) {
    return [];
  }

  const path: EntityId[] = [];
  let cursor: EntityId | undefined = head;
  const visited = new Set<EntityId>();

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    path.push(cursor);
    const node = graph.nodes.get(cursor);
    if (!node || node.dependsOn.size === 0) break;

    let next: EntityId | undefined;
    let nextLevel = -1;
    for (const candidate of node.dependsOn) {
      const candidateLevel = graph.rank.get(candidate) ?? 0;
      if (candidateLevel >= nextLevel) {
        nextLevel = candidateLevel;
        next = candidate;
      }
    }
    cursor = next;
  }

  return path;
};

export const detectCycle = (graph: DependencyGraph): boolean => {
  const visiting = new Set<EntityId>();
  const visited = new Set<EntityId>();

  const hasCycle = (id: EntityId): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const node = graph.nodes.get(id);
    if (!node) {
      visiting.delete(id);
      return false;
    }
    for (const dependency of node.dependsOn) {
      if (hasCycle(dependency)) {
        return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const id of graph.nodes.keys()) {
    if (hasCycle(id)) return true;
  }
  return false;
};

export const serializeGraph = (graph: DependencyGraph): string => {
  const rows: string[] = [];
  for (const [id, node] of graph.nodes) {
    const depends = [...node.dependsOn].join(',');
    const dependents = [...node.dependents].join(',');
    const rank = graph.rank.get(id) ?? 0;
    rows.push(`${id}|depends=${depends}|dependents=${dependents}|rank=${rank}|risk=${node.riskScore}`);
  }
  return rows.join('\n');
};

const topologicalRank = (nodes: ReadonlyMap<EntityId, DependencyNode>): ReadonlyMap<EntityId, number> => {
  const rank = new Map<EntityId, number>();

  const visit = (nodeId: EntityId): number => {
    const existing = rank.get(nodeId);
    if (existing !== undefined) return existing;
    const node = nodes.get(nodeId);
    if (!node) {
      rank.set(nodeId, 0);
      return 0;
    }
    const parentLevel = [...node.dependsOn]
      .map((dependency) => visit(dependency) + 1)
      .reduce((max, value) => Math.max(max, value), 0);
    rank.set(nodeId, parentLevel);
    return parentLevel;
  };

  for (const nodeId of nodes.keys()) {
    visit(nodeId);
  }
  return rank;
};
