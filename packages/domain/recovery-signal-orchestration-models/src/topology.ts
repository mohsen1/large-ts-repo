import type { SignalDimension, SignalPulse } from './contracts';

export interface DimensionCluster {
  readonly id: SignalDimension;
  readonly count: number;
  readonly averageDeviation: number;
  readonly averageWeight: number;
}

export interface SignalTopology {
  readonly clusters: readonly DimensionCluster[];
  readonly topDimension: SignalDimension;
  readonly crossLinks: number;
}

export const buildTopology = (pulses: readonly SignalPulse[]): SignalTopology => {
  const groups = new Map<SignalDimension, { count: number; total: number; weight: number }>();

  for (const pulse of pulses) {
    const existing = groups.get(pulse.dimension) ?? { count: 0, total: 0, weight: 0 };
    const deviation = Math.abs(pulse.value - pulse.baseline) / Math.max(1, Math.abs(pulse.baseline));
    existing.count += 1;
    existing.total += deviation;
    existing.weight += pulse.weight;
    groups.set(pulse.dimension, existing);
  }

  const clusters: DimensionCluster[] = Array.from(groups.entries()).map(([dimension, bucket]) => ({
    id: dimension,
    count: bucket.count,
    averageDeviation: Number((bucket.total / Math.max(1, bucket.count)).toFixed(4)),
    averageWeight: Number((bucket.weight / Math.max(1, bucket.count)).toFixed(4)),
  }));

  const links = clusters.reduce((acc, cluster, index) => {
    if (index === 0) {
      return 0;
    }
    return acc + (cluster.count * clusters[index - 1]!.count);
  }, 0);

  const sorted = [...clusters].sort((a, b) => b.averageDeviation - a.averageDeviation);
  return {
    clusters,
    topDimension: sorted[0]?.id ?? 'capacity',
    crossLinks: links,
  };
};

export const dimensionCoverage = (pulses: readonly SignalPulse[]): number => {
  const unique = new Set(pulses.map((pulse) => pulse.dimension));
  return unique.size / 7;
};
