import type {
  CadenceConstraintSet,
  CadenceDependency,
  CadenceWindow,
  CadenceExecutionMode,
  FabricDependencyDescriptor,
  FabricNode,
  FabricNodeId,
  TopologyBuildResult,
} from './types';

const slotMinutes = 5;

type EdgeMap = Map<FabricNodeId, readonly FabricNodeId[]>;

type VisitContext = Map<number, FabricNodeId[]>;

const computeVisitOrder = (
  id: FabricNodeId,
  edges: EdgeMap,
  visited: Set<FabricNodeId>,
  levels: VisitContext,
): number => {
  if (visited.has(id)) {
    return 0;
  }

  visited.add(id);

  const deps = edges.get(id) ?? [];
  let level = 0;
  for (const next of deps) {
    level = Math.max(level, computeVisitOrder(next, edges, visited, levels) + 1);
  }

  const bucket = levels.get(level) ?? [];
  levels.set(level, [...bucket, id]);
  return level;
};

export const buildTopology = (nodes: readonly FabricNode[], constraints: CadenceConstraintSet): TopologyBuildResult => {
  const nodeById = nodes.reduce((acc, node) => ({ ...acc, [node.nodeId]: node }), {} as Record<FabricNodeId, FabricNode>);
  const dependencyList: CadenceDependency[] = [];
  const edges: EdgeMap = new Map();

  const addDependency = (nodeId: FabricNodeId, dependency: FabricDependencyDescriptor) => {
    if (!nodeById[dependency.target]) {
      return;
    }

    const prev = edges.get(nodeId) ?? [];
    edges.set(nodeId, [...prev, dependency.target]);
    dependencyList.push({
      from: nodeId,
      to: dependency.target,
      reason: dependency.mandatory ? 'policy' : 'capacity',
    });
  };

  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      addDependency(node.nodeId, dependency);
    }
  }

  const roots = nodes
    .map((node) => node.nodeId)
    .filter((id) => ![...edges.values()].some((deps) => deps.includes(id)));

  const leaves = nodes
    .map((node) => node.nodeId)
    .filter((id) => (edges.get(id)?.length ?? 0) === 0);

  const levels = new Map<number, FabricNodeId[]>();
  const visited = new Set<FabricNodeId>();
  for (const node of nodes) {
    computeVisitOrder(node.nodeId, edges, visited, levels);
  }

  const orderedLevels = Array.from(levels.entries())
    .sort(([a], [b]) => a - b)
    .map(([, levelNodes]) => [...levelNodes])
    .slice(0, constraints.maxWindowMinutes)
    .map((levelNodes) => levelNodes as ReadonlyArray<FabricNodeId>);

  return {
    nodeById,
    dependencies: dependencyList,
    roots,
    leaves,
    levels: orderedLevels,
  };
};

export const toTimeline = (topology: TopologyBuildResult, mode: CadenceExecutionMode): readonly CadenceWindow[] => {
  const windows: CadenceWindow[] = [];
  let index = 0;

  const now = Date.now();

  for (const level of topology.levels) {
    for (const nodeId of level) {
      windows.push({
        windowId: `window:${nodeId}-${index}` as const,
        index,
        startIso: new Date(now + index * slotMinutes * 60 * 1000).toISOString(),
        endIso: new Date(now + (index + 1) * slotMinutes * 60 * 1000).toISOString(),
        nodeIds: [nodeId],
        requestedMode: mode,
      });
      index += 1;
    }
  }

  return windows;
};
