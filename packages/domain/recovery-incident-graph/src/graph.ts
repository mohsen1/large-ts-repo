import type {
  CriticalPathEdge,
  GraphNodeState,
  GroupByState,
  IncidentGraph,
  IncidentGraphEdge,
  IncidentGraphNode,
  IncidentNodeId,
  SimulationOutcomeMetrics,
  ValidationIssue,
} from './types';

export interface TopologicalVisit {
  readonly nodeId: IncidentNodeId;
  readonly level: number;
  readonly depth: number;
}

export interface GraphTraversalOptions {
  readonly includeBlocked: boolean;
  readonly riskThreshold: number;
}

export interface GraphView {
  readonly adjacency: Map<IncidentNodeId, readonly IncidentNodeId[]>;
  readonly inboundCount: Map<IncidentNodeId, number>;
  readonly stateByNode: GroupByState;
}

const createAdjacency = (graph: IncidentGraph): Map<IncidentNodeId, IncidentNodeId[]> => {
  const adjacency = new Map<IncidentNodeId, IncidentNodeId[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjacency.set(edge.fromNodeId, [...(adjacency.get(edge.fromNodeId) ?? []), edge.toNodeId]);
  }
  return adjacency;
};

const createInboundCount = (graph: IncidentGraph): Map<IncidentNodeId, number> => {
  const inboundCount = new Map<IncidentNodeId, number>();
  for (const node of graph.nodes) {
    inboundCount.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    inboundCount.set(edge.toNodeId, (inboundCount.get(edge.toNodeId) ?? 0) + 1);
  }
  return inboundCount;
};

const pushByState = (bucket: Record<IncidentGraphNode['state'], IncidentGraphNode[]>, node: IncidentGraphNode): void => {
  bucket[node.state].push(node as IncidentGraphNode);
};

export const createGraphView = (graph: IncidentGraph): GraphView => {
  const bucket: Record<GraphNodeState, IncidentGraphNode[]> = {
    idle: [],
    ready: [],
    blocked: [],
    running: [],
    warning: [],
    complete: [],
    failed: [],
    cancelled: [],
  };

  for (const node of graph.nodes) {
    pushByState(bucket, node);
  }

  return {
    adjacency: createAdjacency(graph),
    inboundCount: createInboundCount(graph),
    stateByNode: {
      idle: bucket.idle,
      ready: bucket.ready,
      blocked: bucket.blocked,
      running: bucket.running,
      warning: bucket.warning,
      complete: bucket.complete,
      failed: bucket.failed,
      cancelled: bucket.cancelled,
    },
  };
};

export const getReachableNodes = (graph: IncidentGraph, sourceNodeId: IncidentNodeId): readonly IncidentNodeId[] => {
  const adjacency = createAdjacency(graph);
  const seen = new Set<IncidentNodeId>([sourceNodeId]);
  const stack = [sourceNodeId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const children = adjacency.get(current) ?? [];
    for (const next of children) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }

  return [...seen];
};

export const hasCycle = (graph: IncidentGraph): boolean => {
  const adjacency = createAdjacency(graph);
  const visiting = new Set<IncidentNodeId>();
  const visited = new Set<IncidentNodeId>();

  const visit = (nodeId: IncidentNodeId): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visiting.add(nodeId);
    const children = adjacency.get(nodeId) ?? [];
    for (const next of children) {
      if (visit(next)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  return graph.nodes.some((node) => visit(node.id));
};

export const topologicalLevels = (graph: IncidentGraph): readonly TopologicalVisit[] => {
  const inbound = createInboundCount(graph);
  const adjacency = createAdjacency(graph);
  const queue = Array.from(inbound.entries())
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId);

  const visits: TopologicalVisit[] = [];
  const levelByNode = new Map<IncidentNodeId, number>();
  let level = 0;
  let processed = 0;

  const currentBatch = [...queue];
  let cursor = [...queue];
  while (cursor.length > 0) {
    const next: IncidentNodeId[] = [];
    for (const nodeId of cursor) {
      levelByNode.set(nodeId, level);
      visits.push({ nodeId, level, depth: level });
      for (const edge of graph.edges) {
        if (edge.fromNodeId !== nodeId) {
          continue;
        }
        const remaining = (inbound.get(edge.toNodeId) ?? 0) - 1;
        inbound.set(edge.toNodeId, remaining);
        if (remaining <= 0) {
          next.push(edge.toNodeId);
        }
      }
    }
    processed += cursor.length;
    cursor = [...new Set(next)];
    level += 1;
  }

  if (processed < graph.nodes.length) {
    for (const node of graph.nodes) {
      if (!levelByNode.has(node.id)) {
        visits.push({ nodeId: node.id, level: level + 1, depth: level + 1 });
      }
    }
  }

  return visits;
};

export const shortestPath = (graph: IncidentGraph, start: IncidentNodeId, target: IncidentNodeId): readonly CriticalPathEdge[] => {
  const distances = new Map<IncidentNodeId, number>(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map<IncidentNodeId, IncidentNodeId | undefined>();
  distances.set(start, 0);
  const unsettled = new Set(graph.nodes.map((node) => node.id));

  while (unsettled.size > 0) {
    const current = [...unsettled].reduce((left, right) => (distances.get(left)! < distances.get(right)! ? left : right));
    unsettled.delete(current);
    if (current === target) {
      break;
    }
    const currentDistance = distances.get(current) ?? Number.POSITIVE_INFINITY;
    for (const edge of graph.edges.filter((entry) => entry.fromNodeId === current)) {
      const nextDistance = currentDistance + edge.weight;
      if (nextDistance < (distances.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.toNodeId, nextDistance);
        previous.set(edge.toNodeId, current);
      }
    }
  }

  const edges: CriticalPathEdge[] = [];
  let cursor: IncidentNodeId | undefined = target;
  while (cursor) {
    const from = previous.get(cursor);
    if (!from) {
      break;
    }
    edges.unshift({
      from,
      to: cursor,
      score: distances.get(cursor) ?? Number.POSITIVE_INFINITY,
    });
    cursor = from;
  }

  return edges;
};

export const edgeWeightByRisk = (graph: IncidentGraph, edge: IncidentGraphEdge): number => {
  const source = graph.nodes.find((node) => node.id === edge.fromNodeId);
  const target = graph.nodes.find((node) => node.id === edge.toNodeId);
  const sourceScore = source ? source.score / 100 : 1;
  const targetScore = target ? target.score / 100 : 1;
  const weight = edge.weight * (0.5 + 0.25 * sourceScore + 0.25 * targetScore);
  return Math.max(0.5, weight);
};

export const toValidationIssue = (path: readonly (string | number)[], message: string, severity: ValidationIssue['severity']): ValidationIssue => ({
  path,
  message,
  severity,
});

export const calculateReadinessCoverageMetrics = (graph: IncidentGraph): SimulationOutcomeMetrics => {
  const ready = graph.nodes.filter((node) => node.state === 'ready').length;
  const running = graph.nodes.filter((node) => node.state === 'running').length;
  const warning = graph.nodes.filter((node) => node.state === 'warning').length;
  const failed = graph.nodes.filter((node) => node.state === 'failed').length;
  const total = Math.max(1, graph.nodes.length);

  return {
    readiness: ((ready + running + warning + failed) / total) * 100,
    riskReduction: graph.nodes.reduce((acc, node) => acc + (100 - node.score), 0) / total,
    parallelismUtilization: running / total,
    timelineCompression: Math.min(1, (ready + running) / total),
  };
};
