import { z } from 'zod';
import type { ReadinessSnapshot, ReadinessProjection, ReadinessProfile } from './operations-readiness';
import type { RecoverySignal } from './types';
import { withBrand } from '@shared/core';

export type HorizonResolution = 'minute' | 'hour' | 'day';

export type RiskVector = 'availability' | 'integrity' | 'latency' | 'throughput' | 'capacity';

export interface HorizonPoint {
  readonly cursor: string;
  readonly value: number;
  readonly pressure: number;
  readonly projection: ReadinessProjection;
  readonly vector: RiskVector;
  readonly signalCount: number;
}

export interface HorizonBucket {
  readonly bucketStart: string;
  readonly bucketEnd: string;
  readonly resolution: HorizonResolution;
  readonly points: readonly HorizonPoint[];
  readonly summaryScore: number;
  readonly dominantProjection: ReadinessProjection;
  readonly atRiskVectors: readonly RiskVector[];
}

export interface HorizonSeries {
  readonly tenant: string;
  readonly runId: string;
  readonly buckets: readonly HorizonBucket[];
  readonly generatedAt: string;
  readonly version: number;
}

export interface HorizonGap {
  readonly bucketStart: string;
  readonly vector: RiskVector;
  readonly severity: number;
  readonly explanation: string;
}

export const HorizonPointSchema = z
  .object({
    cursor: z.string().datetime(),
    value: z.number().finite(),
    pressure: z.number().finite(),
    projection: z.enum(['stabilizing', 'degrading', 'critical', 'unknown']),
    vector: z.enum(['availability', 'integrity', 'latency', 'throughput', 'capacity']),
    signalCount: z.number().int().min(0),
  })
  .strict();

export const HorizonBucketSchema = z
  .object({
    bucketStart: z.string().datetime(),
    bucketEnd: z.string().datetime(),
    resolution: z.enum(['minute', 'hour', 'day']),
    points: z.array(HorizonPointSchema),
    summaryScore: z.number(),
    dominantProjection: z.enum(['stabilizing', 'degrading', 'critical', 'unknown']),
    atRiskVectors: z.array(z.enum(['availability', 'integrity', 'latency', 'throughput', 'capacity'])),
  })
  .strict();

const pointForBucket = (
  cursor: string,
  vector: RiskVector,
  snapshot: ReadinessSnapshot,
  signals: readonly RecoverySignal[],
): HorizonPoint => {
  const relevantSignals = signals.filter((signal) => {
    if (vector === 'availability') return signal.severity >= 7;
    if (vector === 'integrity') return signal.source.includes('integrity');
    if (vector === 'latency') return signal.confidence > 0.8;
    if (vector === 'throughput') return signal.severity >= 4;
    return signal.source.includes('capacity');
  });

  const pressure = relevantSignals.length
    ? relevantSignals.reduce((acc, signal) => acc + signal.severity * (0.4 + signal.confidence), 0) / relevantSignals.length
    : 0;

  return {
    cursor,
    value: Math.max(0, Math.min(1, snapshot.score)),
    pressure: Number(pressure.toFixed(4)),
    projection: snapshot.projection,
    vector,
    signalCount: relevantSignals.length,
  };
};

const bucketResolutionMs = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
} as const;

const projectionWeight = {
  stabilizing: 0.2,
  degrading: 0.5,
  critical: 0.85,
  unknown: 0.1,
} as const;

const classifyProjection = (weighted: number): ReadinessProjection => {
  if (weighted > 0.65) return 'critical';
  if (weighted > 0.45) return 'degrading';
  if (weighted > 0.2) return 'stabilizing';
  return 'unknown';
};

export const buildReadinessHorizon = (
  tenant: string,
  runId: string,
  snapshots: readonly ReadinessSnapshot[],
  signals: readonly RecoverySignal[],
  resolution: HorizonResolution,
): HorizonSeries => {
  if (!snapshots.length) {
    return {
      tenant,
      runId,
      buckets: [],
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  const step = bucketResolutionMs[resolution];
  const maxTime = snapshots.reduce((acc, snapshot) => Math.max(acc, new Date(snapshot.generatedAt).getTime()), 0);
  const minTime = snapshots.reduce((acc, snapshot) => Math.min(acc, new Date(snapshot.generatedAt).getTime()), maxTime);

  const start = Math.floor(minTime / step) * step;
  const end = Math.ceil(maxTime / step) * step;
  const buckets: HorizonBucket[] = [];

  for (let tick = start; tick < end; tick += step) {
    const next = tick + step;
    const relevantSnapshots = snapshots.filter((snapshot) => {
      const eventAt = new Date(snapshot.generatedAt).getTime();
      return eventAt >= tick && eventAt < next;
    });

    if (relevantSnapshots.length === 0) {
      continue;
    }

    const relevantSignals = signals.filter((signal) => {
      const maybe = new Date(snapshotMedianTime(signal, relevantSnapshots)).getTime();
      return maybe >= tick && maybe < next;
    });

    const vectors: RiskVector[] = ['availability', 'integrity', 'latency', 'throughput', 'capacity'];
    const points = vectors.map((vector) => {
      const sample = relevantSnapshots[relevantSnapshots.length - 1] ?? relevantSnapshots[0];
      if (!sample) {
        return {
          cursor: new Date(next).toISOString(),
          value: 0,
          pressure: 0,
          projection: 'unknown' as const,
          vector,
          signalCount: 0,
        };
      }
      return pointForBucket(new Date(next).toISOString(), vector, sample, relevantSignals);
    });

    const summaryScore = Number(
      (points.reduce((acc, point) => acc + projectionWeight[point.projection], 0) / points.length).toFixed(4),
    );
    const counts = points.reduce<Record<ReadinessProjection, number>>(
      (acc, point) => {
        acc[point.projection] += point.pressure;
        return acc;
      },
      { stabilizing: 0, degrading: 0, critical: 0, unknown: 0 },
    );

    const dominantProjection = Object.entries(counts).reduce((best, [projection, pressure]) => {
      const candidate = counts[best as ReadinessProjection] ?? 0;
      return pressure > candidate ? (projection as ReadinessProjection) : best;
    }, 'unknown' as ReadinessProjection);

    const atRiskVectors = points
      .filter((point) => point.projection === 'critical' || point.projection === 'degrading')
      .map((point) => point.vector);

    buckets.push({
      bucketStart: new Date(tick).toISOString(),
      bucketEnd: new Date(next).toISOString(),
      resolution,
      points,
      summaryScore,
      dominantProjection,
      atRiskVectors: Array.from(new Set(atRiskVectors)),
    });
  }

  return {
    tenant,
    runId,
    buckets,
    generatedAt: new Date().toISOString(),
    version: 1,
  };
};

const snapshotMedianTime = (_signal: RecoverySignal, snapshots: readonly ReadinessSnapshot[]): string => {
  if (!snapshots.length) {
    return new Date().toISOString();
  }

  const sortedTimes = snapshots
    .map((snapshot) => new Date(snapshot.generatedAt).getTime())
    .sort((first, second) => first - second);
  const mid = sortedTimes[Math.floor((sortedTimes.length - 1) / 2)] ?? sortedTimes[0];
  if (mid === undefined) {
    return new Date().toISOString();
  }
  return new Date(mid).toISOString();
};

export const summarizeHorizonGaps = (series: HorizonSeries): readonly HorizonGap[] => {
  const gaps: HorizonGap[] = [];
  for (const bucket of series.buckets) {
    for (const point of bucket.points) {
      const shouldWarn = point.projection === 'critical' || point.pressure > 7 || point.signalCount > 4;
      if (!shouldWarn) {
        continue;
      }

      const explanation = [
        point.projection,
        `pressure=${point.pressure.toFixed(2)}`,
        `signals=${point.signalCount}`,
        `vector=${point.vector}`,
      ].join(' | ');

      gaps.push({
        bucketStart: bucket.bucketStart,
        vector: point.vector,
        severity: Math.min(1, point.pressure / 10),
        explanation,
      });
    }
  }

  return gaps;
};

export const enrichHorizonProfile = (
  profile: ReadinessProfile,
  horizons: readonly HorizonSeries[],
): ReadinessProfile => {
  const horizonScores = horizons
    .flatMap((series) => series.buckets)
    .map((bucket) => bucket.summaryScore)
    .filter((value) => Number.isFinite(value));

  const bonus = horizonScores.reduce((acc, score) => acc + score, 0) / Math.max(1, horizonScores.length);
  return {
    ...profile,
    tenant: profile.tenant,
    averageScore: Number(Math.max(0, Math.min(1, profile.averageScore + bonus * 0.05)).toFixed(4)),
    averagePressure: Number(profile.averagePressure + bonus * 2),
    windowMinutes: Math.max(profile.windowMinutes, horizons.length > 0 ? horizons.length * 15 : 0),
    worstProjection: profile.worstProjection,
    snapshots: profile.snapshots.map((snapshot) => ({
      ...snapshot,
      score: Number(Math.max(0, Math.min(1, snapshot.score + bonus * 0.1)).toFixed(4)),
      recommendation: `${snapshot.recommendation} | horizon=${withBrand(profile.tenant, 'ReadinessWindow')}`,
    } as const)),
  };
};
