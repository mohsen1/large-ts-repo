import { z } from 'zod';
import { all, ok, type Result } from '@shared/result';
import type { ReadinessSnapshot, ReadinessProjection } from './operations-readiness';
import type { ReadinessProfile } from './operations-readiness';
import type { RecoverySignal } from './types';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

export interface ForecastPoint {
  readonly instant: string;
  readonly score: number;
  readonly projection: ReadinessProjection;
  readonly confidence: number;
  readonly riskTag: string;
}

export interface ForecastSeries {
  readonly tenant: string;
  readonly runId: string;
  readonly points: readonly ForecastPoint[];
  readonly seed: number;
}

export interface ForecastWindow {
  readonly tenant: string;
  readonly runId: string;
  readonly name: string;
  readonly start: string;
  readonly end: string;
  readonly scoreDelta: number;
  readonly strongestSignal: string;
  readonly confidence: number;
}

export interface ForecastMatrix {
  readonly tenant: string;
  readonly readnessProfile: string;
  readonly windows: readonly ForecastWindow[];
  readonly generatedAt: string;
}

export interface ForecastDiff {
  readonly vector: string;
  readonly delta: number;
  readonly trend: 'improving' | 'degrading';
  readonly reason: string;
}

export const ForecastPointSchema = z
  .object({
    instant: z.string().datetime(),
    score: z.number().min(0).max(1),
    projection: z.enum(['stabilizing', 'degrading', 'critical', 'unknown']),
    confidence: z.number().min(0).max(1),
    riskTag: z.string().min(1),
  })
  .strict();

export const ForecastWindowSchema = z
  .object({
    tenant: z.string().min(1),
    runId: z.string().min(1),
    name: z.string().min(1),
    start: z.string().datetime(),
    end: z.string().datetime(),
    scoreDelta: z.number(),
    strongestSignal: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const projectionOrder: ReadinessProjection[] = ['critical', 'degrading', 'stabilizing', 'unknown'];

const projectionToRiskTag = {
  critical: 'critical',
  degrading: 'high-risk',
  stabilizing: 'warming',
  unknown: 'low-confidence',
};

const calculateConfidence = (signals: readonly RecoverySignal[]): number => {
  if (!signals.length) return 0.3;
  const avgConfidence = signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length;
  const adjusted = Math.min(1, Math.max(0.25, avgConfidence * 0.85));
  return Number(adjusted.toFixed(4));
};

const estimateDelta = (from: ReadinessProjection, to: ReadinessProjection): number => {
  const start = projectionOrder.indexOf(from);
  const end = projectionOrder.indexOf(to);
  if (start === -1 || end === -1) return 0;
  return Number((end - start) * 0.12);
};

export const buildForecastSeries = (
  tenant: string,
  runId: string,
  profile: ReadinessProfile,
  snapshots: readonly ReadinessSnapshot[],
  signals: readonly RecoverySignal[],
): ForecastSeries => {
  const points = snapshots.flatMap((snapshot, index) => {
    const confidence = calculateConfidence(signals);
    if (!Number.isFinite(snapshot.score)) {
      return [];
    }

    const riskTag = projectionToRiskTag[snapshot.projection] ?? 'low-confidence';
    const baseScore = Number(snapshot.score.toFixed(4));

    const step = index === 0 ? 0 : snapshots[index - 1]!.score - baseScore;
    const confidenceFactor = confidence * (1 + Math.sin(index));

    return [
      {
        instant: new Date().toISOString(),
        score: Number(Math.max(0, Math.min(1, baseScore + Math.abs(step))).toFixed(4)),
        projection: snapshot.projection,
        confidence: Number(Math.min(1, confidenceFactor).toFixed(4)),
        riskTag,
      } as const,
    ];
  });

  const seed = points.length ? Math.round(points.reduce((acc, point) => acc + point.score, 0) / points.length * 1000) : 0;

  return {
    tenant,
    runId,
    points,
    seed,
  };
};

const buildWindowName = (from: ReadinessProjection, to: ReadinessProjection, tenant: string): string => {
  return `${tenant}-${from}-to-${to}`;
};

const buildWindowConfidence = (points: readonly ForecastPoint[]): number => {
  if (!points.length) {
    return 0;
  }
  return Number((points.reduce((acc, point) => acc + point.confidence, 0) / points.length).toFixed(4));
};

const strongestSignalFromWindow = (
  points: readonly ForecastPoint[],
  signals: readonly RecoverySignal[],
): string => {
  const best = signals
    .slice()
    .sort((first, second) => second.severity - first.severity)[0];
  const top = best?.source ?? 'none';
  const pointSig = points[points.length - 1]?.riskTag ?? 'none';
  return `${top}|${pointSig}`;
};

export const buildForecastWindows = (
  tenant: string,
  runId: string,
  readiness: RecoveryReadinessPlan,
  history: readonly ReadinessSnapshot[],
  signals: readonly RecoverySignal[],
): ForecastMatrix => {
  const sorted = [...history].sort((left, right) => new Date(left.generatedAt).getTime() - new Date(right.generatedAt).getTime());

  const projectionBuckets = new Map<ReadinessProjection, number[]>();
  for (const snapshot of sorted) {
    const list = projectionBuckets.get(snapshot.projection) ?? [];
    projectionBuckets.set(snapshot.projection, [...list, snapshot.score]);
  }

  const windows = Array.from(projectionBuckets.entries()).map(([fromProjection, scores]) => {
    const fromIndex = projectionOrder.indexOf(fromProjection);
    const toProjection = fromIndex > 0 ? projectionOrder[fromIndex - 1] ?? fromProjection : projectionOrder[projectionOrder.length - 1];
    const delta = estimateDelta(fromProjection, toProjection);
    const confidence = Number(Math.min(1, 0.2 + scores.length * 0.08 + projectionOrder.length * 0.05).toFixed(4));
    return {
      tenant,
      runId,
      name: buildWindowName(fromProjection, toProjection, tenant),
      start: readiness.windows[0]?.fromUtc ?? readiness.createdAt,
      end: readiness.windows[0]?.toUtc ?? readiness.createdAt,
      scoreDelta: delta,
      strongestSignal: strongestSignalFromWindow(
        scores.map((score, index) => ({
          instant: new Date().toISOString(),
          score: Number((score + index / 100).toFixed(4)),
          projection: fromProjection,
          confidence: 0.5,
          riskTag: projectionToRiskTag[fromProjection],
        })),
        signals,
      ),
      confidence,
    } as const;
  });

  return {
    tenant,
    readnessProfile: readiness.planId,
    windows,
    generatedAt: new Date().toISOString(),
  };
};

export const compareForecasts = (left: ForecastSeries, right: ForecastSeries): Result<readonly ForecastDiff[], string> => {
  if (left.tenant !== right.tenant || left.runId !== right.runId) {
    return { ok: false, error: 'tenant-or-run-mismatch' };
  }

  const leftSeed = left.seed;
  const rightSeed = right.seed;
  const delta = Number((rightSeed - leftSeed).toFixed(4));

  const diffs = [] as ForecastDiff[];

  if (delta > 0) {
    diffs.push({
      vector: 'score',
      delta,
      trend: 'improving',
      reason: 'seed drift improved',
    });
  } else if (delta < 0) {
    diffs.push({
      vector: 'score',
      delta,
      trend: 'degrading',
      reason: 'seed drift degraded',
    });
  }

  if (left.points.length !== right.points.length) {
    const diff = right.points.length - left.points.length;
    diffs.push({
      vector: 'point-density',
      delta: Number(diff.toFixed(4)),
      trend: diff > 0 ? 'improving' : 'degrading',
      reason: `series length changed from ${left.points.length} to ${right.points.length}`,
    });
  }

  return ok(diffs);
};
