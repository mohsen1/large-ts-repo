import type { Brand } from '@shared/core';
import type { RecoverySignal } from './types';

export type RhythmBucket = 'minute' | 'hour' | 'day' | 'week';

export interface RhythmPoint {
  readonly bucket: RhythmBucket;
  readonly index: number;
  readonly signalCount: number;
  readonly weightedSeverity: number;
  readonly averageConfidence: number;
}

export interface RhythmProfile {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly rhythm: readonly RhythmPoint[];
  readonly generatedAt: string;
  readonly trend: 'rising' | 'falling' | 'stable';
  readonly peakBucket: RhythmPoint['index'];
}

export interface RhythmSummary {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly totalSignals: number;
  readonly bucketCount: number;
  readonly weightedAverageSeverity: number;
  readonly peakIndex: RhythmPoint['index'];
  readonly peakWeight: number;
  readonly trendScore: number;
}

const bucketName = (bucket: RhythmBucket): 'minute' | 'hour' | 'day' | 'week' => bucket;

const toBucketIndex = (timestamp: number, bucket: RhythmBucket): number => {
  const date = new Date(timestamp);
  if (bucket === 'minute') return date.getUTCMinutes();
  if (bucket === 'hour') return date.getUTCHours();
  if (bucket === 'day') return date.getUTCDay();
  return Math.floor((date.getUTCDate() - 1) / 7);
};

const rangeForBucket = (bucket: RhythmBucket): number => {
  if (bucket === 'minute') return 60;
  if (bucket === 'hour') return 24;
  if (bucket === 'day') return 7;
  return 5;
};

const calculateWeight = (signal: RecoverySignal): number => signal.severity * signal.confidence;

export const buildRhythmProfile = (
  tenant: Brand<string, 'TenantId'>,
  signals: readonly RecoverySignal[],
  bucket: RhythmBucket,
): RhythmProfile => {
  const size = rangeForBucket(bucket);
  const zeroPoint: RhythmPoint = {
    bucket,
    index: -1,
    signalCount: 0,
    weightedSeverity: 0,
    averageConfidence: 0,
  };

  const points = Array.from({ length: size }, (_, index) => ({
    ...zeroPoint,
    index,
  } as RhythmPoint));

  const buckets: RhythmPoint[] = points.map((point) => ({ ...point }));

  const parsed = signals
    .map((signal) => ({
      timestamp: Date.parse(signal.detectedAt),
      severity: signal.severity,
      confidence: signal.confidence,
    }))
    .filter((entry) => Number.isFinite(entry.timestamp));

  for (const signal of parsed) {
    const index = toBucketIndex(signal.timestamp, bucket);
    const current = buckets[index];
    const next: RhythmPoint = {
      ...current,
      index,
      signalCount: current.signalCount + 1,
      weightedSeverity: current.weightedSeverity + calculateWeight({
        id: 'tmp',
        source: 'runtime',
        severity: signal.severity,
        confidence: signal.confidence,
        detectedAt: new Date().toISOString(),
        details: {},
      }),
      averageConfidence: (current.averageConfidence * current.signalCount + signal.confidence) /
        Math.max(1, current.signalCount + 1),
    };
    buckets[index] = next;
  }

  const maxPoint = [...buckets].sort((left, right) => {
    const leftScore = left.weightedSeverity + left.averageConfidence * 100;
    const rightScore = right.weightedSeverity + right.averageConfidence * 100;
    return rightScore - leftScore;
  })[0];

  const totalSignals = buckets.reduce((acc, point) => acc + point.signalCount, 0);
  const weighted = buckets.reduce((acc, point) => acc + point.weightedSeverity, 0);
  const trend = computeTrend(buckets);

  return {
    tenant,
    rhythm: [...buckets],
    generatedAt: new Date().toISOString(),
    trend,
    peakBucket: maxPoint?.index ?? 0,
  };
};

export const summarizeRhythmProfile = (profile: RhythmProfile): RhythmSummary => {
  const totalSignals = profile.rhythm.reduce((acc, point) => acc + point.signalCount, 0);
  const weighted = profile.rhythm.reduce((acc, point) => acc + point.weightedSeverity, 0);
  const peak = [...profile.rhythm].sort((left, right) => right.weightedSeverity - left.weightedSeverity)[0];
  const trendScore = profile.rhythm.reduce((acc, point) => acc + point.weightedSeverity, 0) /
    Math.max(1, profile.rhythm.length);

  return {
    tenant: profile.tenant,
    totalSignals,
    bucketCount: profile.rhythm.length,
    weightedAverageSeverity: Number((weighted / Math.max(1, totalSignals)).toFixed(3)),
    peakIndex: peak?.index ?? 0,
    peakWeight: peak?.weightedSeverity ?? 0,
    trendScore: Number(trendScore.toFixed(3)),
  };
};

const computeTrend = (rhythm: readonly RhythmPoint[]): RhythmProfile['trend'] => {
  if (rhythm.length < 2) return 'stable';
  const first = rhythm[0]?.weightedSeverity ?? 0;
  const last = rhythm[rhythm.length - 1]?.weightedSeverity ?? 0;
  if (last > first * 1.2) return 'rising';
  if (first > last * 1.2) return 'falling';
  return 'stable';
};

export const clampRhythm = (profile: RhythmProfile, maxPoints: number): RhythmProfile => {
  if (profile.rhythm.length <= maxPoints) return profile;
  const keep = [...profile.rhythm].slice(-maxPoints);
  return {
    tenant: profile.tenant,
    rhythm: keep,
    generatedAt: profile.generatedAt,
    trend: profile.trend,
    peakBucket: keep.reduce((acc, point, index) =>
      point.weightedSeverity > (keep[acc]?.weightedSeverity ?? 0) ? index : acc, 0),
  };
};

export const detectAnomalies = (profile: RhythmProfile): readonly RhythmPoint[] => {
  const mean = summarizeRhythmProfile(profile).trendScore;
  const tolerance = mean * 2.2;
  return profile.rhythm.filter((point) => point.weightedSeverity > tolerance);
};

export const rhythmToSeries = (profile: RhythmProfile): string => {
  return profile.rhythm
    .map((point) => `${bucketName(point.bucket)}#${point.index}:${point.signalCount}/${point.weightedSeverity.toFixed(2)}`)
    .join('\n');
};
