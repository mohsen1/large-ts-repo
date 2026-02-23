import type { LabSignal, OrchestrationLab, LabSignalTier } from './types';

export interface SignalBucket {
  readonly tier: LabSignalTier;
  readonly count: number;
  readonly minScore: number;
  readonly maxScore: number;
  readonly averageScore: number;
  readonly topSignalIds: readonly string[];
}

export interface SignalTrend {
  readonly signalId: string;
  readonly labId: OrchestrationLab['id'];
  readonly deltas: readonly number[];
  readonly averageDelta: number;
  readonly direction: 'up' | 'down' | 'flat';
}

export interface SignalCatalog {
  readonly labId: OrchestrationLab['id'];
  readonly byTier: Record<LabSignalTier, SignalBucket>;
  readonly criticalTop: readonly LabSignal[];
  readonly sortedByScore: readonly LabSignal[];
}

export const resolveSignal = (signal: LabSignal, index: number): number => signal.score + index * 0.5;

export const bucketizeSignals = (signals: readonly LabSignal[]): SignalCatalog => {
  const base: SignalBucket = {
    tier: 'signal',
    count: 0,
    minScore: Number.POSITIVE_INFINITY,
    maxScore: Number.NEGATIVE_INFINITY,
    averageScore: 0,
    topSignalIds: [],
  };

  const byTier = new Map<LabSignalTier, SignalBucket & { readonly scoreSum: number }>([
    ['signal', { ...base, tier: 'signal', scoreSum: 0 }],
    ['warning', { ...base, tier: 'warning', scoreSum: 0 }],
    ['critical', { ...base, tier: 'critical', scoreSum: 0 }],
  ]);

  const sortedByScore = [...signals].sort((left, right) => right.score - left.score);

  for (const signal of signals) {
    const bucket = byTier.get(signal.tier);
    if (!bucket) {
      continue;
    }
    const minScore = Math.min(bucket.minScore, signal.score);
    const maxScore = Math.max(bucket.maxScore, signal.score);
    const count = bucket.count + 1;
    const scoreSum = bucket.scoreSum + signal.score;
    const nextTop = [...bucket.topSignalIds, signal.id].slice(0, 3);
    byTier.set(signal.tier, {
      tier: bucket.tier,
      count,
      minScore,
      maxScore,
      averageScore: count === 0 ? 0 : scoreSum / count,
      topSignalIds: nextTop,
      scoreSum,
    });
  }

  const finalBuckets: Record<LabSignalTier, SignalBucket> = {
    signal: {
      tier: 'signal',
      count: byTier.get('signal')?.count ?? 0,
      minScore: byTier.get('signal')?.minScore === Number.POSITIVE_INFINITY ? 0 : (byTier.get('signal')?.minScore ?? 0),
      maxScore: byTier.get('signal')?.maxScore === Number.NEGATIVE_INFINITY ? 0 : (byTier.get('signal')?.maxScore ?? 0),
      averageScore: byTier.get('signal')?.averageScore ?? 0,
      topSignalIds: byTier.get('signal')?.topSignalIds ?? [],
    },
    warning: {
      tier: 'warning',
      count: byTier.get('warning')?.count ?? 0,
      minScore: byTier.get('warning')?.minScore === Number.POSITIVE_INFINITY ? 0 : (byTier.get('warning')?.minScore ?? 0),
      maxScore: byTier.get('warning')?.maxScore === Number.NEGATIVE_INFINITY ? 0 : (byTier.get('warning')?.maxScore ?? 0),
      averageScore: byTier.get('warning')?.averageScore ?? 0,
      topSignalIds: byTier.get('warning')?.topSignalIds ?? [],
    },
    critical: {
      tier: 'critical',
      count: byTier.get('critical')?.count ?? 0,
      minScore: byTier.get('critical')?.minScore === Number.POSITIVE_INFINITY ? 0 : (byTier.get('critical')?.minScore ?? 0),
      maxScore: byTier.get('critical')?.maxScore === Number.NEGATIVE_INFINITY ? 0 : (byTier.get('critical')?.maxScore ?? 0),
      averageScore: byTier.get('critical')?.averageScore ?? 0,
      topSignalIds: byTier.get('critical')?.topSignalIds ?? [],
    },
  };

  return {
    labId: signals[0]?.labId ?? 'lab:unknown',
    byTier: finalBuckets,
    criticalTop: sortedByScore.filter((signal) => signal.tier === 'critical').slice(0, 4),
    sortedByScore,
  };
};

export const computeSignalTrends = (labHistory: readonly OrchestrationLab[]): SignalTrend[] => {
  const historyByLab = new Map<OrchestrationLab['id'], OrchestrationLab[]>();
  for (const snapshot of labHistory) {
    const bucket = historyByLab.get(snapshot.id) ?? [];
    bucket.push(snapshot);
    historyByLab.set(snapshot.id, bucket);
  }

  const trends: SignalTrend[] = [];
  for (const [labId, histories] of historyByLab) {
    const ordered = [...histories].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    const first = ordered[0];
    if (!first || ordered.length < 2) {
      continue;
    }

    for (const signal of ordered.at(-1)?.signals ?? []) {
      const prior = first.signals.find((candidate) => candidate.id === signal.id);
      if (!prior) {
        continue;
      }
      const deltas = ordered.map((entry) => (entry.signals.find((candidate) => candidate.id === signal.id)?.score ?? signal.score) - prior.score);
      const averageDelta = deltas.reduce((acc, value) => acc + value, 0) / deltas.length;
      const direction = averageDelta > 0.1 ? 'up' : averageDelta < -0.1 ? 'down' : 'flat';

      trends.push({
        signalId: signal.id,
        labId,
        deltas,
        averageDelta,
        direction,
      });
    }
  }

  return trends;
};

export const summarizeCatalog = (catalog: SignalCatalog): string => {
  const criticalCount = catalog.byTier.critical.count;
  const top = catalog.criticalTop[0];
  return `critical=${criticalCount}, top=${top ? top.title : 'none'}`;
};
