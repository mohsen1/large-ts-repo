import type { SignalDimension, SignalGraph, SignalPulse, SignalGraphAudit, SignalGraphEdge } from './models';

export type ReadonlyMapBy<K extends keyof T, T extends Record<string, unknown>> = ReadonlyMap<T[K], T>;

export const bucketByDimension = (pulses: ReadonlyArray<SignalPulse>): Record<SignalDimension, SignalPulse[]> => {
  const buckets: Record<SignalDimension, SignalPulse[]> = {
    capacity: [],
    latency: [],
    reachability: [],
    integrity: [],
    availability: [],
    cost: [],
    compliance: [],
  };

  for (const pulse of pulses) {
    buckets[pulse.dimension].push(pulse);
  }

  return buckets;
};

export const sortSignalsByRisk = <T extends SignalPulse>(pulses: ReadonlyArray<T>): T[] => {
  return [...pulses].sort((left, right) => {
    const leftDelta = left.value - left.baseline;
    const rightDelta = right.value - right.baseline;
    if (leftDelta === rightDelta) {
      return right.weight - left.weight;
    }
    return rightDelta - leftDelta;
  });
};

export const driftRatio = (pulse: Pick<SignalPulse, 'value' | 'baseline'>): number => {
  if (pulse.baseline === 0) {
    return 0;
  }
  return Number(((pulse.value - pulse.baseline) / Math.abs(pulse.baseline)).toFixed(4));
};

export const buildDependencyEdges = <T extends { id: string; tags: string[] }>(
  nodes: ReadonlyArray<T>
): SignalGraphEdge<T>[] => {
  const edges: SignalGraphEdge<T>[] = [];
  const byDimensionTag = new Map<string, T[]>();

  for (const node of nodes) {
    for (const tag of node.tags) {
      const bucket = byDimensionTag.get(tag) ?? [];
      bucket.push(node);
      byDimensionTag.set(tag, bucket);
    }
  }

  for (const peers of byDimensionTag.values()) {
    for (let i = 0; i < peers.length - 1; i += 1) {
      const from = peers[i];
      const to = peers[i + 1];
      const confidence = peers.length > 2 ? 0.5 : 0.25;
      edges.push({
        from: from.id,
        to: to.id,
        weight: Math.min(1, confidence + (i * 0.08)),
        rationale: `shared tag bridge ${from.tags.join('|')}`,
      });
    }
  }

  return edges;
};

export const toSignalGraph = <T extends { id: string; tags: string[] }>(
  pulses: ReadonlyArray<T>
): { graph: SignalGraph<T>; audit: SignalGraphAudit } => {
  const edges = buildDependencyEdges(pulses);
  const incoming = new Map<string, number>(pulses.map((pulse) => [pulse.id, 0]));

  for (const edge of edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const depth = [...incoming.values()].reduce((acc, value) => (value > acc ? value : acc), 0);
  const disconnected = pulses.filter((pulse) => !(incoming.get(pulse.id) ?? 0)).length;

  const cycleDetected = edges.some((edge) => edge.from === edge.to || (incoming.get(edge.from) ?? 0) > 5);

  return {
    graph: { nodes: pulses, edges },
    audit: {
      generatedAt: new Date().toISOString(),
      nodeCount: pulses.length,
      cycleDetected,
      topologicalDepth: depth,
      disconnectedClusters: disconnected,
    },
  };
};

export const groupByFacility = <T extends { facilityId: string }>(items: ReadonlyArray<T>) => {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    acc[item.facilityId] = [...(acc[item.facilityId] ?? []), item];
    return acc;
  }, {});
};

export const topNByDimension = <T extends SignalPulse>(
  pulses: ReadonlyArray<T>,
  dimension: SignalDimension,
  count: number
): T[] => {
  return [...pulses]
    .filter((pulse) => pulse.dimension === dimension)
    .sort((a, b) => driftRatio(b) - driftRatio(a))
    .slice(0, count);
};
