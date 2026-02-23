import type {
  CriticalPathEdge,
  GraphAnalysisReport,
  GraphNodeState,
  IncidentGraph,
  IncidentNodeId,
  TopologyHeatPoint,
} from './types';
import { calculateReadinessCoverageMetrics, topologicalLevels } from './graph';

const toDecimal = (value: number): number => Number(value.toFixed(2));

export const analyzeCriticalPath = (graph: IncidentGraph): readonly CriticalPathEdge[] => {
  const byRisk = [...graph.edges].sort((left, right) => {
    const scoreLeft = graph.nodes.find((node) => node.id === left.toNodeId)?.score ?? 0;
    const scoreRight = graph.nodes.find((node) => node.id === right.toNodeId)?.score ?? 0;
    return scoreRight - scoreLeft;
  });
  return byRisk.slice(0, Math.min(10, byRisk.length)).map((edge) => ({
    from: edge.fromNodeId,
    to: edge.toNodeId,
    score: toDecimal(edge.weight + (edge.kind === 'override' ? 1 : 0) + (edge.conditional ? 0.5 : 0)),
  }));
};

const buildHeatPoint = (graph: IncidentGraph, nodeId: IncidentNodeId, levelByNode: Map<IncidentNodeId, number>): TopologyHeatPoint => {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  const inbound = graph.edges.filter((edge) => edge.toNodeId === nodeId).length;
  const outbound = graph.edges.filter((edge) => edge.fromNodeId === nodeId).length;
  const score = Math.max(0, node ? node.score / 100 : 0);
  return {
    nodeId,
    depth: levelByNode.get(nodeId) ?? 0,
    inbound,
    outbound,
    risk: {
      severity: Math.min(1, score * 1.05),
      confidence: Math.min(1, Math.max(0.1, 1 - score)),
      uncertainty: Number(Math.random().toFixed(2)),
    },
  };
};

export const calculateRiskHotspots = (graph: IncidentGraph): readonly TopologyHeatPoint[] => {
  const levels = topologicalLevels(graph);
  const depthByNode = new Map(levels.map((visit) => [visit.nodeId, visit.level]));
  const all = graph.nodes.map((node) => buildHeatPoint(graph, node.id, depthByNode));

  return [...all]
    .sort((left, right) => right.risk.severity - left.risk.severity)
    .slice(0, Math.max(1, Math.ceil(all.length / 3)));
};

export const buildGraphAnalysisReport = (graph: IncidentGraph): GraphAnalysisReport => {
  const levels = topologicalLevels(graph);
  const readyNodes = graph.nodes.filter((node) => node.state === 'ready' || node.state === 'running').map((node) => node.id);
  const clusters = new Map<string, IncidentNodeId[]>();

  for (const node of graph.nodes) {
    const depth = levels.find((visit) => visit.nodeId === node.id)?.depth ?? 0;
    const key = depth % 2 === 0 ? 'A' : 'B';
    const bucket = clusters.get(key) ?? [];
    bucket.push(node.id);
    clusters.set(key, bucket);
  }

  return {
    graphId: graph.meta.id,
    generatedAt: new Date().toISOString(),
    riskHotspots: calculateRiskHotspots(graph),
    criticalPath: analyzeCriticalPath(graph),
    longestLevel: Math.max(...levels.map((item) => item.level), 0),
    clusterCount: clusters.size,
    readyNodes,
  };
};

export const calculateReadinessScore = (graph: IncidentGraph): number => {
  const metrics = calculateReadinessCoverageMetrics(graph);
  const bandBonus = graph.nodes.reduce((acc, node) => {
    const bonus = node.riskBand === 'green' ? 4 : node.riskBand === 'yellow' ? 2 : node.riskBand === 'orange' ? 1 : 0;
    return acc + bonus;
  }, 0);
  return Math.max(0, Math.min(100, metrics.readiness + bandBonus));
};

export const stateHistogram = (graph: IncidentGraph): Record<GraphNodeState, number> => {
  const buckets: Record<GraphNodeState, number> = {
    idle: 0,
    ready: 0,
    blocked: 0,
    running: 0,
    warning: 0,
    complete: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const node of graph.nodes) {
    buckets[node.state] += 1;
  }
  return buckets;
};
