import { withBrand } from '@shared/core';
import type { AsyncMapper } from '@shared/type-level';
import type {
  CommandEdge,
  CommandGraph,
  CommandNode,
  CommandNodeId,
  CommandSynthesisResult,
  CommandWave,
  CommandWaveId,
  CommandGraphEvent,
  CommandGraphId,
  CommandTraceId,
} from './types';
import {
  buildNodeFingerprint,
  ensureNodeId,
  ensureGraphId,
  extractPipeline,
  summarizeNodeBySeverity,
} from './types';

export interface CommandGraphAudit {
  readonly graphId: CommandGraphId;
  readonly issue: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly nodeId?: CommandNodeId;
}

export interface CommandGraphTopology {
  readonly ordered: readonly CommandNodeId[];
  readonly layers: readonly CommandNodeId[][];
  readonly indegree: Record<string, number>;
  readonly reverse: Record<string, CommandNodeId[]>;
}

export interface CommandGraphForecast {
  readonly graphId: CommandGraphId;
  readonly readyInMs: number;
  readonly waveCount: number;
  readonly blockers: number;
  readonly criticalPathLength: number;
  readonly riskScore: number;
  readonly conflictCount: number;
}

const computeAdjacency = (graph: CommandGraph): Record<string, CommandNodeId[]> =>
  graph.edges.reduce<Record<string, CommandNodeId[]>>(
    (acc, edge) => {
      const current = acc[edge.from] ?? [];
      current.push(edge.to);
      return {
        ...acc,
        [edge.from]: current,
      };
    },
    {},
  );

const collectNodeLookup = (graph: CommandGraph): Record<string, CommandNode> =>
  Object.fromEntries(graph.nodes.map((node) => [node.id, node] as const));

const detectCycle = (graph: CommandGraph): readonly CommandGraphAudit[] => {
  const adjacency = computeAdjacency(graph);
  const colors = new Map<string, 'white' | 'grey' | 'black'>();
  const audits: CommandGraphAudit[] = [];

  for (const node of graph.nodes) {
    colors.set(node.id, 'white');
  }

  const visit = (node: CommandNodeId, stack: readonly string[]): void => {
    const color = colors.get(node);
    if (color === 'black' || color === 'grey') {
      if (color === 'grey') {
        audits.push({ graphId: graph.id, issue: `cycle-detected:${stack.join('>')}`, severity: 'critical', nodeId: node });
      }
      return;
    }
    colors.set(node, 'grey');
    const next = adjacency[node] ?? [];
    for (const target of next) {
      visit(target, [...stack, target]);
    }
    colors.set(node, 'black');
  };

  for (const node of graph.nodes) {
    visit(node.id, [node.id]);
  }

  return audits;
};

const topoSort = (graph: CommandGraph): readonly CommandNodeId[] => {
  const indegree = new Map<CommandNodeId, number>();
  const edges = computeAdjacency(graph);

  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const ordered: CommandNodeId[] = [];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    ordered.push(next);
    for (const child of edges[next] ?? []) {
      const nextDegree = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, nextDegree);
      if (nextDegree === 0) queue.push(child);
    }
  }

  return ordered;
};

const buildLayers = (graph: CommandGraph, topology: readonly CommandNodeId[]): readonly CommandNodeId[][] => {
  const indegree = new Map<CommandNodeId, number>();
  const edges = computeAdjacency(graph);
  const lookup = collectNodeLookup(graph);
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const frontier: CommandNodeId[] = topology.filter((id) => (indegree.get(id) ?? 0) === 0);
  const visited = new Set<CommandNodeId>();
  const layers: CommandNodeId[][] = [];

  while (frontier.length > 0) {
    const nextLayer = [...frontier];
    for (const id of nextLayer) visited.add(id);
    frontier.length = 0;
    layers.push(nextLayer);

    for (const id of nextLayer) {
      for (const child of edges[id] ?? []) {
        const degree = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, degree);
        const childNode = lookup[child];
        if (degree <= 0 && childNode && !visited.has(childNode.id) && !frontier.includes(childNode.id)) {
          frontier.push(childNode.id);
        }
      }
    }
  }

  return layers;
};

const buildReverse = (graph: CommandGraph): Record<string, CommandNodeId[]> =>
  graph.edges.reduce<Record<string, CommandNodeId[]>>(
    (acc, edge) => ({
      ...acc,
      [edge.to]: [...(acc[edge.to] ?? []), edge.from],
    }),
    {},
  );

const estimateReadiness = (graph: CommandGraph): number => {
  const resolved = graph.nodes.filter((node) => node.state === 'resolved').length;
  const total = graph.nodes.length || 1;
  return Math.round((resolved / total) * 100);
};

const estimateCost = (graph: CommandGraph): number =>
  graph.nodes.reduce((sum, node) => sum + node.weight, 0) + graph.edges.reduce((sum, edge) => sum + edge.cost, 0);

const estimateLatency = (graph: CommandGraph): number =>
  graph.edges.reduce((sum, edge) => sum + edge.latencyBudgetMs, 0) + graph.nodes.length * 150;

const riskVector = (graph: CommandGraph): number =>
  graph.nodes.reduce((sum, node) => {
    const severity = node.severity === 'critical' ? 3 : node.severity === 'warning' ? 2 : 1;
    const urgency = node.urgency === 'high' ? 3 : node.urgency === 'medium' ? 2 : 1;
    const weighted = (node.weight + 1) * (0.6 + severity * 0.2 + urgency * 0.2);
    return Math.round(sum + weighted);
  }, 0);

const buildCriticalPath = (topology: readonly CommandNodeId[], graph: CommandGraph): readonly CommandNodeId[] => {
  const edges = computeAdjacency(graph);
  const nodeById = collectNodeLookup(graph);
  const byWeight = [...topology].sort((leftId, rightId) => {
    const left = nodeById[leftId];
    const right = nodeById[rightId];
    if (!left || !right) return 0;
    return right.weight - left.weight;
  });
  return byWeight.slice(0, Math.max(1, Math.ceil(topology.length / 3)));
};

export const normalizeCommandGraph = (graph: CommandGraph): CommandGraph => ({
  ...graph,
  updatedAt: new Date().toISOString(),
  nodes: graph.nodes.toSorted((left, right) => left.name.localeCompare(right.name)),
  edges: graph.edges.toSorted((left, right) => {
    if (left.order === right.order) return left.latencyBudgetMs - right.latencyBudgetMs;
    return left.order - right.order;
  }),
});

export const planWaves = (graph: CommandGraph): readonly CommandWave[] => {
  const topology = buildTopology(graph);
  const nodesById = collectNodeLookup(graph);
  return topology.layers.map((layer, index) => ({
    id: withBrand(`${graph.id}:wave:${index}`, 'CommandWaveId'),
    graphId: graph.id,
    title: `Wave ${index + 1}`,
    index,
    commands: layer.map((id) => nodesById[id]).filter((node): node is CommandNode => Boolean(node)),
    dependsOn: index === 0 ? [] : [withBrand(`${graph.id}:wave:${index - 1}`, 'CommandWaveId')],
    executionState: 'queued',
  }));
};

export const buildTopology = (graph: CommandGraph): CommandGraphTopology => {
  const ordered = topoSort(graph);
  const layers = buildLayers(graph, ordered);
  const indegree = Object.fromEntries(graph.nodes.map((node) => [node.id, 0])) as Record<string, number>;
  for (const edge of graph.edges) {
    indegree[edge.to] = (indegree[edge.to] ?? 0) + 1;
  }
  return {
    ordered,
    layers,
    indegree,
    reverse: buildReverse(graph),
  };
};

export const runAudit = (graph: CommandGraph): readonly CommandGraphAudit[] => {
  const issues: CommandGraphAudit[] = [];
  if (graph.nodes.length === 0) {
    issues.push({ graphId: graph.id, issue: 'graph-empty', severity: 'critical' });
  }
  if (graph.waves.length === 0) {
    issues.push({ graphId: graph.id, issue: 'no-wave-planned', severity: 'warning' });
  }
  issues.push(...detectCycle(graph));
  if (graph.edges.length > graph.nodes.length * 2) {
    issues.push({
      graphId: graph.id,
      issue: `edge-density:${graph.edges.length}`,
      severity: 'info',
    });
  }
  return issues;
};

export const buildForecast = (graph: CommandGraph): CommandGraphForecast => {
  const topology = buildTopology(graph);
  const severityCounts = summarizeNodeBySeverity(graph.nodes);
  const criticalPath = buildCriticalPath(topology.ordered, graph);
  const riskScore = riskVector(graph);
  const readiness = estimateReadiness(graph);
  const blockers = graph.nodes.filter((node) => node.state === 'blocked' || node.state === 'deferred').length;
  return {
    graphId: graph.id,
    readyInMs: estimateLatency(graph),
    waveCount: topology.layers.length,
    blockers,
    criticalPathLength: criticalPath.length,
    riskScore: Math.max(1, riskScore + readiness),
    conflictCount: severityCounts.critical + severityCounts.warning,
  };
};

export const toSynthesisResult = (graph: CommandGraph): CommandSynthesisResult => {
  const topology = buildTopology(graph);
  const forecast = buildForecast(graph);
  return {
    graphId: graph.id,
    ready: forecast.blockers === 0 && topology.ordered.length === graph.nodes.length,
    conflicts: runAudit(graph).map((entry) => entry.issue),
    criticalPaths: buildCriticalPath(topology.ordered, graph),
    readinessScore: estimateReadiness(graph),
    executionOrder: topology.ordered,
    forecastMinutes: Math.max(1, Math.round(forecast.readyInMs / 1_000 / 60)),
  };
};

export const rewriteGraph = async (graph: CommandGraph, mapper: AsyncMapper<CommandNode, CommandNode>): Promise<CommandGraph> => {
  const nodes = await Promise.all(graph.nodes.map((node) => mapper(node)));
  const events: CommandGraphEvent[] = nodes.map((node) => ({
    id: withBrand(`${graph.id}:event:${node.version}:${node.id}`, 'CommandGraphEventId'),
    graphId: graph.id,
    traceId: withBrand(`${graph.id}:trace:${node.version}`, 'CommandTraceId') as CommandTraceId,
    eventType: 'node_state_changed',
    timestamp: new Date().toISOString(),
    payload: {
      nodeId: node.id,
      state: node.state,
    },
  }));
  return {
    ...graph,
    nodes,
    waves: graph.waves,
    events: [...events],
    updatedAt: new Date().toISOString(),
  } as unknown as CommandGraph;
};

type CommandStateSeed = CommandNode['state'];
const toGraphId = (tenant: string, runId: string): CommandGraphId => ensureGraphId(tenant, runId);

const buildSeedNode = (graphId: CommandGraphId, index: number): CommandNode => ({
  id: ensureNodeId(graphId, index, 'seed'),
  graphId,
  name: `seed-${index}`,
  group: `group-${index % 3}`,
  weight: 3 + index,
  severity: index % 3 === 0 ? 'critical' : index % 3 === 1 ? 'warning' : 'info',
  urgency: index % 3 === 0 ? 'high' : index % 3 === 1 ? 'medium' : 'low',
  state: (index % 3 === 0 ? 'deferred' : index % 3 === 1 ? 'active' : 'pending') as CommandStateSeed,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stateAt: new Date().toISOString(),
  version: index,
  metadata: {
    owner: 'synthesizer',
    region: 'global',
    labels: [index % 2 === 0 ? 'core' : 'edge'],
    tags: ['seed'],
    tagsVersion: index,
  },
});

export const createSampleGraph = (options: {
  tenant: string;
  runId: string;
  operator?: string;
  waveCount?: number;
}): CommandGraph => {
  const graphId = toGraphId(options.tenant, options.runId);
  const nodes = Array.from({ length: Math.max(4, options.waveCount ?? 4) }, (_, index) => buildSeedNode(graphId, index));
  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index]!.id,
    to: node.id,
    order: index,
    latencyBudgetMs: 180 + index * 35,
    cost: node.weight + 1,
    confidence: 0.2 + Math.min(0.7, index / nodes.length),
    payload: {
      operator: options.operator ?? 'orchestrator',
      version: nodes.length,
    },
  }));
  const graph: CommandGraph = {
    id: withBrand(graphId, 'CommandGraphId'),
    tenant: options.tenant,
    runId: options.runId,
    rootPlanId: `${options.tenant}:plan:${Date.now()}`,
    nodes,
    edges,
    waves: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      source: 'planner',
      revision: 1,
      requestedBy: options.operator ?? 'system',
      notes: ['seeded graph'],
    },
  };
  return { ...graph, waves: planWaves(graph) };
};

export const createSynthesisGraph = (options: {
  tenant: string;
  runId: string;
  operator?: string;
  waveCount?: number;
}): CommandGraph => createSampleGraph(options);
