import type {
  FabricCommand,
  FabricDependencyEdge,
  FabricDependencyMode,
  FabricDependencyMatrix,
  FabricId,
  FabricTopology,
} from './types';

export interface FabricGraphNode {
  readonly commandId: FabricCommand['id'];
  readonly inDegree: number;
  readonly outDegree: number;
  readonly dependencies: readonly FabricCommand['id'][];
  readonly dependents: readonly FabricCommand['id'][];
}

export interface TopologyDiagnostics {
  readonly cycles: readonly ReadonlyArray<FabricCommand['id']>[];
  readonly orphanNodes: readonly FabricCommand['id'][];
  readonly hasCycle: boolean;
  readonly maxDepth: number;
}

export const buildDependencyMatrix = (commands: readonly FabricCommand[], edges: readonly FabricDependencyEdge[]): FabricDependencyMatrix => {
  const matrix = new Map<FabricCommand['id'], FabricCommand['id'][]>();
  for (const command of commands) {
    matrix.set(command.id, []);
  }
  if (matrix.size === 0) {
    return matrix;
  }
  for (const edge of edges) {
    const bucket = matrix.get(edge.to);
    if (bucket) {
      bucket.push(edge.from);
    }
  }
  return matrix;
};

export const buildReverseMatrix = (matrix: FabricDependencyMatrix): Map<FabricCommand['id'], FabricCommand['id'][]> => {
  const reverse = new Map<FabricCommand['id'], FabricCommand['id'][]>();
  for (const [to, fromList] of matrix.entries()) {
    if (!reverse.has(to)) {
      reverse.set(to, []);
    }
    for (const from of fromList) {
      const bucket = reverse.get(from);
      if (bucket) {
        bucket.push(to);
      } else {
        reverse.set(from, [to]);
      }
    }
  }
  return reverse;
};

export const deriveTopologyGraph = (
  commands: readonly FabricCommand[],
  edges: readonly FabricDependencyEdge[],
): FabricTopology => {
  const zones = commands.reduce<Record<string, FabricCommand['id'][]>>((acc, command) => {
    const zone = command.strategy === 'parallel' ? 'parallel' : command.strategy === 'serial' ? 'serial' : 'staged';
    acc[zone] = [...(acc[zone] ?? []), command.id];
    return acc;
  }, {});

  const commandIds = commands.map((command) => command.id);

  return {
    commandIds,
    edges,
    zones,
    metadata: {
      commandCount: commands.length,
      edgeCount: edges.length,
      generatedAt: new Date().toISOString(),
      hardEdges: edges.filter((edge) => edge.mode === 'hard' || edge.mandatory).length,
      optionalEdges: edges.filter((edge) => !edge.mandatory).length,
    },
  };
};

const getNodeDependencies = (matrix: FabricDependencyMatrix, id: FabricCommand['id']): FabricCommand['id'][] => {
  return matrix.get(id) ?? [];
};

const getNodeDependents = (reverseMatrix: Map<FabricCommand['id'], FabricCommand['id'][]>, id: FabricCommand['id']): FabricCommand['id'][] => {
  return reverseMatrix.get(id) ?? [];
};

export const computeDependencyGraph = (
  topology: FabricTopology,
): ReadonlyMap<FabricCommand['id'], FabricGraphNode> => {
  const commandMap = new Map<FabricCommand['id'], FabricGraphNode>();
  const syntheticCommands = topology.commandIds.map((id) => {
    return {
      id,
      tenantId: id as never,
      incidentId: id as never,
      name: String(id),
      priority: 1 as const,
      blastRadius: 1,
      estimatedRecoveryMinutes: 1,
      strategy: 'serial' as const,
      constraints: [],
      runbook: [],
      context: {},
      requiresApprovals: 0,
      requiresWindows: [],
    };
  });
  const matrix = buildDependencyMatrix(syntheticCommands, topology.edges);
  const reverse = buildReverseMatrix(matrix);

  for (const id of topology.commandIds) {
    const dependencies = getNodeDependencies(matrix, id);
    const dependents = getNodeDependents(reverse, id);
    commandMap.set(id, {
      commandId: id,
      inDegree: dependencies.length,
      outDegree: dependents.length,
      dependencies,
      dependents,
    });
  }

  return commandMap;
};

export const orderedExecutionPlan = (topology: FabricTopology): readonly FabricCommand['id'][] => {
  const matrix = buildDependencyMatrix(
    topology.commandIds.map((id) => ({
      id,
      tenantId: id as never,
      incidentId: id as never,
      name: String(id),
      priority: 1,
      blastRadius: 1,
      estimatedRecoveryMinutes: 1,
      strategy: 'serial',
      constraints: [],
      runbook: [],
      context: {},
      requiresApprovals: 0,
      requiresWindows: [],
    })),
    topology.edges,
  );
  const reverse = buildReverseMatrix(matrix);
  const queue = topology.commandIds.filter((id) => (matrix.get(id) ?? []).length === 0);
  const resolved = new Set<FabricCommand['id']>();
  const result: FabricCommand['id'][] = [];
  const queueSet = new Set<FabricCommand['id']>(queue);

  while (queueSet.size > 0) {
    const id = queueSet.values().next().value;
    if (id === undefined) {
      break;
    }
    queueSet.delete(id);
    if (resolved.has(id)) {
      continue;
    }

    resolved.add(id);
    result.push(id);

    for (const dependent of reverse.get(id) ?? []) {
      const deps = matrix.get(dependent) ?? [];
      const remaining = deps.filter((source) => !resolved.has(source));
      if (remaining.length === 0 && !resolved.has(dependent)) {
        queueSet.add(dependent);
      }
    }
  }

  return result;
};

export const computeDiagnostics = (topology: FabricTopology): TopologyDiagnostics => {
  const plan = orderedExecutionPlan(topology);
  const hasCycle = plan.length !== topology.commandIds.length;

  const matrix = buildDependencyMatrix(
    topology.commandIds.map((id) => ({
      id,
      tenantId: id as never,
      incidentId: id as never,
      name: String(id),
      priority: 1,
      blastRadius: 1,
      estimatedRecoveryMinutes: 1,
      strategy: 'serial',
      constraints: [],
      runbook: [],
      context: {},
      requiresApprovals: 0,
      requiresWindows: [],
    })),
    topology.edges,
  );
  const orphanNodes = topology.commandIds.filter((commandId) => (matrix.get(commandId) ?? []).length === 0);

  const cycles: ReadonlyArray<FabricCommand['id']>[] = [];
  if (hasCycle) {
    const unresolved = new Set(topology.commandIds);
    for (const commandId of plan) {
      unresolved.delete(commandId);
    }
    cycles.push(Array.from(unresolved));
  }

  const depthMap = new Map<FabricCommand['id'], number>();
  const visit = (node: FabricCommand['id'], path: ReadonlySet<FabricCommand['id']>): number => {
    if (depthMap.has(node)) {
      return depthMap.get(node) as number;
    }

    if (path.has(node)) {
      return 0;
    }

    const dependencies = matrix.get(node) ?? [];
    const nextPath = new Set(path);
    nextPath.add(node);
    if (dependencies.length === 0) {
      depthMap.set(node, 1);
      return 1;
    }

    let depth = 0;
    for (const dependency of dependencies) {
      depth = Math.max(depth, visit(dependency, nextPath));
    }
    const finalDepth = depth + 1;
    depthMap.set(node, finalDepth);
    return finalDepth;
  };

  for (const commandId of topology.commandIds) {
    visit(commandId, new Set());
  }

  const maxDepth = Math.max(0, ...Array.from(depthMap.values()));

  return {
    cycles,
    orphanNodes,
    hasCycle,
    maxDepth,
  };
};

export const partitionByMode = (
  topology: FabricTopology,
): Readonly<Record<FabricDependencyMode, FabricCommand['id'][]>> => {
  const partitions: Record<FabricDependencyMode, FabricCommand['id'][]> = {
    hard: [],
    soft: [],
    advisory: [],
  };

  for (const edge of topology.edges) {
    if (!partitions[edge.mode]) {
      partitions[edge.mode] = [];
    }
    partitions[edge.mode].push(edge.to);
  }

  return partitions;
};

export const attachFabricIdentity = (
  fabricId: FabricId,
  topology: FabricTopology,
): FabricTopology & { fabricId: FabricId } => {
  return {
    ...topology,
    commandIds: [...topology.commandIds],
    metadata: {
      ...topology.metadata,
      fabricId,
    },
    fabricId,
  };
};
