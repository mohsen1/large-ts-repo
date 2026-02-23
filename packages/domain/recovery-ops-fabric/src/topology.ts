import {
  type FabricEdge,
  type FabricNode,
  type FabricTopology,
  type AlertSignal,
  isCriticalSignal,
  toCommandId,
  type FabricRunId,
  signalHealthImpact,
} from './models';

export interface FabricTraversal<T> {
  readonly node: FabricNode;
  readonly depth: number;
  readonly value: T;
}

interface WalkState<T> {
  readonly byNode: Map<string, number>;
  readonly order: FabricTraversal<T>[];
}

const clampWeight = (value: number): number => {
  if (value <= 0) {
    return 0.001;
  }
  return Math.min(1, value);
};

const edgeReliabilityWeight = (edge: FabricEdge): number => {
  return clampWeight(edge.reliability);
};

const nodeLoadScore = (node: FabricNode): number => {
  const spare = Math.max(1, node.maxCapacity);
  const used = node.cpu + node.mem;
  const ratio = Math.max(0, Math.min(1, used / spare));
  return Number((1 - ratio).toFixed(4));
};

const rankNodes = (nodes: readonly FabricNode[]) => {
  return [...nodes].sort((left, right) => {
    const leftScore = nodeLoadScore(left);
    const rightScore = nodeLoadScore(right);
    return rightScore - leftScore;
  });
}

export const buildAdjacency = (topology: FabricTopology): Map<string, FabricEdge[]> => {
  const map = new Map<string, FabricEdge[]>();
  for (const node of topology.nodes) {
    map.set(node.id, []);
  }
  for (const edge of topology.edges) {
    const fromList = map.get(edge.from);
    const toList = map.get(edge.to);
    if (fromList) {
      fromList.push(edge);
    }
    if (toList) {
      const reverse: FabricEdge = {
        ...edge,
        from: edge.to,
        to: edge.from,
      };
      toList.push(reverse);
    }
  }
  return map;
};

export const enumerateCriticalNodes = (topology: FabricTopology): FabricNode[] => {
  const nodes = rankNodes(topology.nodes);
  return nodes.filter((node) => node.health === 'critical' || node.health === 'offline');
};

export const rankByConnectivity = (topology: FabricTopology): Array<{ node: FabricNode; score: number }> => {
  const adjacency = buildAdjacency(topology);
  const nodes = [...topology.nodes];

  return nodes.map((node) => {
    const out = adjacency.get(node.id) ?? [];
    const inWeight = out.reduce((acc, edge) => acc + edgeReliabilityWeight(edge) * edge.capacity, 0);
    const score = inWeight * nodeLoadScore(node);
    return { node, score: Number(score.toFixed(4)) };
  }).sort((left, right) => right.score - left.score);
};

export const computeCriticalityScore = (topology: FabricTopology, signal: AlertSignal): number => {
  const base = signalHealthImpact(signal);
  const target = topology.profiles.find((profile) => profile.region.includes(signal.dimension))?.projectedPeakQps ?? 1;
  const demandDelta = Math.abs(signal.value - signal.baseline);
  const demandSignal = target > 0 ? demandDelta / target : 0;
  return Number((base + demandSignal).toFixed(4));
};

export const buildCommandSequence = (topology: FabricTopology, signals: readonly AlertSignal[]): ReadonlyArray<{ runId: FabricRunId; commandId: ReturnType<typeof toCommandId> }> => {
  const runId = `run-${Date.now()}` as FabricRunId;
  const ordered = [...signals].sort((left, right) => {
    const leftScore = signalHealthImpact(left);
    const rightScore = signalHealthImpact(right);
    return rightScore - leftScore;
  });

  const nodesByHealth = rankByConnectivity(topology).map((entry) => entry.node);

  const criticalSignals = ordered.filter((signal) => isCriticalSignal(signal));
  const commandList: Array<{ runId: FabricRunId; commandId: ReturnType<typeof toCommandId> }> = [];

  for (let index = 0; index < criticalSignals.length; index += 1) {
    const node = nodesByHealth[index % Math.max(1, nodesByHealth.length)];
    commandList.push({ runId, commandId: toCommandId(criticalSignals[index].facilityId, node.id) });
  }

  return commandList;
};
