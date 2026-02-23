import {
  type RecoveryAtlasEdge,
  type RecoveryAtlasNode,
  type RecoveryAtlasSnapshot,
  type RecoveryAtlasNodeId,
  type RecoveryAtlasWindowId,
  type RecoveryAtlasPlan,
  type RecoveryAtlasRunStep,
  type RecoveryAtlasPlanId,
} from './types';
import { filterNodes, calculateNodeRisk, normalizeScore } from './utils';

export interface AtlasPath {
  readonly nodeIds: readonly RecoveryAtlasNodeId[];
  readonly totalRisk: number;
  readonly stepCount: number;
  readonly constrained: boolean;
}

export interface PathScore {
  readonly windowId: RecoveryAtlasWindowId;
  readonly total: number;
  readonly criticalRatio: number;
  readonly degradedRatio: number;
  readonly topNodes: readonly RecoveryAtlasNodeId[];
}

export const inboundDegree = (nodeId: RecoveryAtlasNodeId, edges: readonly RecoveryAtlasEdge[]): number => {
  return edges.filter((edge) => edge.to === nodeId).length;
};

export const outboundDegree = (nodeId: RecoveryAtlasNodeId, edges: readonly RecoveryAtlasEdge[]): number => {
  return edges.filter((edge) => edge.from === nodeId).length;
};

export const computeCriticalPath = (
  snapshot: RecoveryAtlasSnapshot,
  startNode: RecoveryAtlasNodeId,
): readonly RecoveryAtlasNodeId[] => {
  const byId = new Map<RecoveryAtlasNodeId, RecoveryAtlasNode>(snapshot.graph.nodes.map((node) => [node.id, node]));
  const edgesByFrom = snapshot.graph.edges.reduce(
    (acc, edge) => {
      const list = acc.get(edge.from);
      if (list) {
        list.push(edge);
      } else {
        acc.set(edge.from, [edge]);
      }
      return acc;
    },
    new Map<RecoveryAtlasNodeId, RecoveryAtlasEdge[]>(),
  );

  const visited = new Set<RecoveryAtlasNodeId>();
  const path: RecoveryAtlasNodeId[] = [];

  const walk = (nodeId: RecoveryAtlasNodeId): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    path.push(nodeId);

    const nextEdges = edgesByFrom.get(nodeId) ?? [];
    const next = [...nextEdges]
      .sort((a, b) => b.dependencyWeight - a.dependencyWeight)
      .find((edge) => byId.has(edge.to));

    if (next) {
      walk(next.to);
    }
  };

  walk(startNode);
  return path;
};

export const pathsForWindow = (snapshot: RecoveryAtlasSnapshot): readonly AtlasPath[] => {
  const nodeMap = new Map(snapshot.graph.nodes.map((node) => [node.id, node]));

  return snapshot.graph.nodes
    .filter((node) => inboundDegree(node.id, snapshot.graph.edges) === 0)
    .map((root) => {
      const route = computeCriticalPath(snapshot, root.id);
      const risks = route.map((nodeId) => calculateNodeRisk(nodeMap.get(nodeId)!));
      const totalRisk = normalizeScore(risks.reduce((acc, risk) => acc + risk, 0));
      return {
        nodeIds: route,
        totalRisk,
        stepCount: route.length,
        constrained: risks.some((risk) => risk > 70),
      };
    });
};

export const scoreWindow = (snapshot: RecoveryAtlasSnapshot): PathScore => {
  const filtered = filterNodes(snapshot.graph.nodes, {});
  const risks = filtered.map((node) => calculateNodeRisk(node));
  const totalRisk = normalizeScore(risks.reduce((acc, risk) => acc + risk, 0));
  const criticalRatio = risks.length
    ? normalizeScore((risks.filter((risk) => risk > 70).length / risks.length) * 100)
    : 0;
  const degradedRatio = risks.length
    ? normalizeScore((risks.filter((risk) => risk > 45 && risk <= 70).length / risks.length) * 100)
    : 0;

  const topNodes = [...filtered]
    .map((node) => ({ node, risk: calculateNodeRisk(node) }))
    .sort((left, right) => right.risk - left.risk)
    .slice(0, 3)
    .map(({ node }) => node.id);

  return {
    windowId: snapshot.id,
    total: totalRisk,
    criticalRatio,
    degradedRatio,
    topNodes,
  };
};

export const composePlanSteps = (
  plan: Pick<RecoveryAtlasPlan, 'id' | 'steps' | 'title'>,
  riskLimit: number,
): readonly RecoveryAtlasRunStep[] => {
  return plan.steps
    .filter((step) => step.expectedDurationMinutes >= 0)
    .sort((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes)
    .map((step) => ({
      ...step,
      id: `${plan.id}:${step.id}` as RecoveryAtlasRunStep['id'],
      requiredApprovals: step.requiredApprovals,
    }))
    .filter((step) => riskLimit < 0 || step.expectedDurationMinutes <= riskLimit);
};

export const flattenPlanIds = (plans: readonly Pick<RecoveryAtlasPlan, 'id'>[]): readonly RecoveryAtlasPlanId[] =>
  plans.map((plan) => plan.id);

export const choosePrimaryWindowId = (plans: readonly PathScore[]): RecoveryAtlasWindowId | undefined => {
  const sorted = [...plans].sort((left, right) => left.total - right.total);
  return sorted[0] ? sorted[0].windowId : undefined;
};
