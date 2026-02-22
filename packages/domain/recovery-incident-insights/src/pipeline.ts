import type { IncidentSignal, SignalDimension, SignalSeverity } from './types';

export type DimensionBucket = Record<SignalDimension, IncidentSignal[]>;

export interface ScoreBreakdown {
  readonly dimension: SignalDimension;
  readonly raw: number;
  readonly weighted: number;
  readonly weightedComponents: ReadonlyArray<{
    readonly id: IncidentSignal['signalId'];
    readonly severityWeight: number;
    readonly confidenceWeight: number;
    readonly contribution: number;
  }>;
}

export interface AggregationResult {
  readonly byDimension: ScoreBreakdown[];
  readonly overall: number;
  readonly topSignals: readonly IncidentSignal[];
}

const severityScale: Record<SignalSeverity, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

const dimensionWeights: Record<SignalDimension, number> = {
  infrastructure: 1.25,
  security: 1.15,
  traffic: 1.05,
  'data-plane': 1.2,
  'control-plane': 1.1,
};

const rankSignal = (signal: IncidentSignal): number =>
  (severityScale[signal.severity] ?? 0.1) * (signal.confidence + 0.2) +
  signal.tags.length * 0.07;

export const bucketByDimension = (signals: readonly IncidentSignal[]): DimensionBucket =>
  signals.reduce((acc, signal) => {
    const bucket = acc[signal.dimension];
    if (bucket === undefined) {
      return { ...acc, [signal.dimension]: [signal] };
    }
    return { ...acc, [signal.dimension]: [...bucket, signal] };
  }, {} as DimensionBucket);

export const aggregateDimensionScore = (signals: readonly IncidentSignal[], dimension: SignalDimension): ScoreBreakdown => {
  const components = signals
    .map((signal) => {
      const contribution = Number((rankSignal(signal) * dimensionWeights[dimension]).toFixed(4));
      return {
        id: signal.signalId,
        severityWeight: severityScale[signal.severity],
        confidenceWeight: signal.confidence,
        contribution,
      };
    })
    .sort((left, right) => right.contribution - left.contribution);

  const sum = components.reduce((acc, current) => acc + current.contribution, 0);
  const raw = Math.min(sum, 1);
  const weighted = Number((raw * dimensionWeights[dimension]).toFixed(4));

  return {
    dimension,
    raw: Number(raw.toFixed(4)),
    weighted,
    weightedComponents: components,
  };
};

export const aggregateSignals = (signals: readonly IncidentSignal[]): AggregationResult => {
  const buckets = bucketByDimension(signals);
  const byDimension = (Object.entries(buckets) as Array<[SignalDimension, IncidentSignal[]]>)
    .map(([dimension, dimensionSignals]) =>
      aggregateDimensionScore(dimensionSignals, dimension),
    )
    .sort((left, right) => right.weighted - left.weighted);

  const signalById = new Map(signals.map((signal) => [signal.signalId, signal] as const));
  const topSignals = byDimension
    .flatMap((bucket) => bucket.weightedComponents.slice(0, 2).map((entry) => entry.id))
    .map((id) => signalById.get(id))
    .filter((signal): signal is IncidentSignal => signal !== undefined);

  const overall = Number(
    Math.max(
      0,
      Math.min(
        1,
        byDimension.reduce((acc, item) => acc + item.weighted, 0) / Math.max(byDimension.length, 1),
      ),
    ).toFixed(4),
  );

  return {
    byDimension,
    overall,
    topSignals,
  };
};

export const topContributingSignals = (signals: readonly IncidentSignal[], limit = 5): readonly IncidentSignal[] =>
  signals
    .slice()
    .sort((left, right) => rankSignal(right) - rankSignal(left))
    .slice(0, limit);
