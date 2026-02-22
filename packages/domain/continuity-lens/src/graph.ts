import type {
  ContinuitySignal,
  ContinuitySignalId,
  SignalGraph,
  SignalGraphEdge,
  ContinuityTenantId,
} from './types';

const normalizeSource = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '-');

export interface EdgeCandidate {
  readonly fromId: ContinuitySignalId;
  readonly toId: ContinuitySignalId;
  readonly reason: string;
  readonly weight: number;
}

const shareDimension = (left: ContinuitySignal, right: ContinuitySignal): boolean => {
  const keyset = new Set(left.dimensions.map((item) => `${item.dimension}:${item.key}=${item.value}`));
  return right.dimensions.some((dimension) => keyset.has(`${dimension.dimension}:${dimension.key}=${dimension.value}`));
};

const shouldCorrelate = (left: ContinuitySignal, right: ContinuitySignal): boolean => {
  if (left.zone !== right.zone) return false;
  const sameService = normalizeSource(left.service) === normalizeSource(right.service);
  const sameComponent = normalizeSource(left.component) === normalizeSource(right.component);
  const hasSharedDimensions = shareDimension(left, right);
  return sameService || sameComponent || hasSharedDimensions;
};

const similarity = (left: ContinuitySignal, right: ContinuitySignal): number => {
  const timeDeltaMs =
    Math.abs(Date.parse(left.reportedAt) - Date.parse(right.reportedAt));
  const sharedTags = left.tags.filter((tag) => right.tags.includes(tag)).length;
  const temporalScore = timeDeltaMs > 0 ? Math.max(0, 1 - timeDeltaMs / (1000 * 60 * 60)) : 1;
  const tagScore = Math.min(1, sharedTags / Math.max(1, Math.max(left.tags.length, right.tags.length)));
  const riskScore = (left.severity + right.severity) / 200;
  return Number(((temporalScore * 0.5) + (tagScore * 0.3) + (riskScore * 0.2)).toFixed(4));
};

const buildEdges = (ordered: readonly ContinuitySignal[]): readonly SignalGraphEdge[] => {
  const edges: SignalGraphEdge[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const left = ordered[i];
      const right = ordered[j];
      if (!left || !right) continue;
      if (!shouldCorrelate(left, right)) continue;
      const score = similarity(left, right);
      if (score < 0.25) continue;
      edges.push({
        from: left.id,
        to: right.id,
        weight: score,
        reason: `${left.service}->${right.service} similarity`,
      });
    }
  }
  return edges;
};

const detectCycle = (edges: readonly SignalGraphEdge[]): boolean => {
  const outgoing = new Map<string, readonly string[]>();
  const incoming = new Map<string, number>();

  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    incoming.set(edge.from, incoming.get(edge.from) ?? 0);
  }

  const ready: string[] = [];
  for (const [node, count] of incoming.entries()) {
    if (count === 0) ready.push(node);
  }

  const consumed = new Set<string>();
  const stack = [...ready];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current || consumed.has(current)) continue;
    consumed.add(current);
    const next = outgoing.get(current) ?? [];
    for (const item of next) {
      const degree = (incoming.get(item) ?? 0) - 1;
      incoming.set(item, degree);
      if (degree === 0) {
        stack.push(item);
      }
    }
  }

  return consumed.size < incoming.size;
};

export const buildSignalGraph = (tenantId: ContinuityTenantId, signals: readonly ContinuitySignal[]): SignalGraph => {
  const orderedByTime = [...signals]
    .slice()
    .sort((left, right) => Date.parse(left.reportedAt) - Date.parse(right.reportedAt))
    .map((signal) => signal.id);

  const signalById = new Map(signals.map((signal) => [signal.id, signal] as const));
  const orderedSignals = orderedByTime
    .map((id) => signalById.get(id))
    .filter((entry): entry is ContinuitySignal => entry !== undefined);

  const edges = buildEdges(orderedSignals).map((entry) => ({
    ...entry,
    weight: Number(entry.weight.toFixed(4)),
  }));
  const cycleFree = !detectCycle(edges);

  return {
    tenantId,
    signalIds: orderedByTime,
    edges,
    orderedByTime,
    cycleFree,
  };
};

export const graphCriticality = (graph: SignalGraph): number => {
  const weighted = graph.edges.reduce((sum, edge) => sum + edge.weight, 0);
  const density = graph.signalIds.length <= 1 ? 0 : weighted / graph.signalIds.length;
  const resolvedRatio = graph.orderedByTime.length ? 1 - graph.orderedByTime.length / graph.signalIds.length : 0;
  const penalty = graph.cycleFree ? 0 : 0.4;
  return Number(Math.min(100, (density * 100) + (resolvedRatio * 30) + penalty).toFixed(4));
};
