import type { SignalId, SignalRiskProfile, SignalEnvelope, RiskBand, SignalKind } from './signal-core';

export interface SignalEdge {
  readonly from: SignalId;
  readonly to: SignalId;
  readonly weight: number;
}

export interface SignalDependencyGraph {
  readonly nodes: readonly SignalEnvelope[];
  readonly edges: readonly SignalEdge[];
}

export interface SpreadProjection {
  readonly sourceId: SignalId;
  readonly pathDepth: number;
  readonly reached: number;
  readonly topBand: RiskBand;
  readonly kind: SignalKind;
}

export const buildDependencyGraph = (signals: readonly SignalEnvelope[], edges: readonly SignalEdge[]): SignalDependencyGraph => {
  const nodes = [...signals];
  const edgeSet = edges.filter((edge) => signals.some((signal) => signal.id === edge.from) && signals.some((signal) => signal.id === edge.to));
  return { nodes, edges: edgeSet };
};

const walk = (start: SignalId, adjacency: ReadonlyMap<SignalId, readonly SignalEdge[]>, visited: Set<SignalId>, depth: number, maxDepth: number): SignalId[] => {
  if (depth >= maxDepth) {
    return [];
  }
  const direct = adjacency.get(start) ?? [];
  const out: SignalId[] = [];
  for (const edge of direct) {
    if (visited.has(edge.to)) {
      continue;
    }
    visited.add(edge.to);
    out.push(edge.to);
    out.push(...walk(edge.to, adjacency, visited, depth + 1, maxDepth));
  }
  return out;
};

export const projectSpread = (
  signals: readonly SignalEnvelope[],
  edges: readonly SignalEdge[],
  sourceId: SignalId,
  maxDepth = 3,
): SpreadProjection => {
  const byId = new Map(signals.map((signal) => [signal.id, signal] as const));
  const adjacency = new Map<SignalId, SignalEdge[]>();
  for (const edge of edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
  }
  const reachedIds = walk(sourceId, adjacency, new Set([sourceId]), 0, maxDepth);
  const riskBands: RiskBand[] = reachedIds
    .map((id) => byId.get(id)?.risk)
    .filter((risk): risk is RiskBand => risk !== undefined);
  const source = byId.get(sourceId);

  return {
    sourceId,
    pathDepth: reachedIds.length === 0 ? 0 : Math.min(maxDepth, Math.ceil(Math.log2(reachedIds.length + 1))),
    reached: reachedIds.length,
    topBand: riskBands.includes('critical') ? 'critical' : riskBands.includes('high') ? 'high' : riskBands.includes('moderate') ? 'moderate' : 'low',
    kind: source?.kind ?? 'operational',
  };
};

export const rankBySpread = (signals: readonly SignalEnvelope[], edges: readonly SignalEdge[]): readonly SpreadProjection[] =>
  signals
    .map((signal) => projectSpread(signals, edges, signal.id, 4))
    .sort((left, right) => right.reached - left.reached);

export const summarizeSignalGraph = (projections: readonly SpreadProjection[]) => ({
  total: projections.length,
  critical: projections.filter((entry) => entry.topBand === 'critical').length,
  high: projections.filter((entry) => entry.topBand === 'high').length,
});

export const findCriticalReach = (
  signals: readonly SignalEnvelope[],
  edges: readonly SignalEdge[],
): readonly SignalId[] =>
  rankBySpread(signals, edges)
    .filter((entry) => entry.topBand === 'critical' && entry.reached >= 2)
    .map((entry) => entry.sourceId);
