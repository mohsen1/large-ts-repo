import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { RecoverySignal, RunSession, RunPlanSnapshot } from './types';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { buildCommandIntentMatrix } from './command-intent';
import { buildPortfolioForecast } from './portfolio-forecast';

export type ReadinessEnvelopeKey = Brand<string, 'ReadinessEnvelopeKey'>;
export type ReadinessProjection = 'stabilizing' | 'degrading' | 'critical' | 'unknown';

export interface ReadinessSnapshot {
  readonly tenant: string;
  readonly runId: string;
  readonly planId: string;
  readonly score: number;
  readonly pressure: number;
  readonly projection: ReadinessProjection;
  readonly recommendation: string;
  readonly generatedAt: string;
}

export interface ReadinessMatrix {
  readonly tenant: string;
  readonly key: ReadinessEnvelopeKey;
  readonly snapshots: readonly ReadinessSnapshot[];
  readonly trend: number;
  readonly summary: string;
}

export interface ReadinessProfile {
  readonly tenant: string;
  readonly windowMinutes: number;
  readonly snapshots: readonly ReadinessSnapshot[];
  readonly averageScore: number;
  readonly averagePressure: number;
  readonly worstProjection: ReadinessProjection;
}

const confidenceBand = (signals: readonly RecoverySignal[]): number => {
  if (!signals.length) return 0;
  const confidence = signals.reduce((acc, signal) => acc + signal.confidence, 0) / signals.length;
  return Number(confidence.toFixed(4));
};

const pressure = (signals: readonly RecoverySignal[]): number => {
  if (!signals.length) return 0;
  const sum = signals.reduce((acc, signal) => acc + signal.severity * signal.confidence, 0);
  return Number((sum / signals.length).toFixed(4));
};

const projectionFrom = (score: number): ReadinessProjection => {
  if (score >= 0.85) return 'critical';
  if (score >= 0.7) return 'degrading';
  if (score >= 0.45) return 'stabilizing';
  return 'unknown';
};

const recommendationFrom = (projection: ReadinessProjection, pressureValue: number): string => {
  if (projection === 'critical') {
    return `urgent-throttle enabled pressure=${pressureValue.toFixed(2)}`;
  }
  if (projection === 'degrading') {
    return `monitor-and-stage pressure=${pressureValue.toFixed(2)}`;
  }
  if (projection === 'stabilizing') {
    return `proceed with controlled actions pressure=${pressureValue.toFixed(2)}`;
  }
  return `collect-more-signals pressure=${pressureValue.toFixed(2)}`;
};

export const buildReadinessSnapshot = (
  tenant: string,
  session: RunSession,
  snapshot: RunPlanSnapshot,
  readinessPlan: RecoveryReadinessPlan,
): ReadinessSnapshot => {
  const intentMatrix = buildCommandIntentMatrix(session, snapshot, readinessPlan);
  const forecast = buildPortfolioForecast(session, snapshot, readinessPlan);

  const score = Number((intentMatrix.aggregateScore * 0.6 + confidenceBand(session.signals) * 0.4).toFixed(4));
  const pressureValue = Number((pressure(session.signals) + forecast.forecasts.length).toFixed(4));
  const projected = projectionFrom(1 - Math.min(1, score));

  return {
    tenant,
    runId: String(session.runId),
    planId: String(snapshot.id),
    score,
    pressure: pressureValue,
    projection: projected,
    recommendation: recommendationFrom(projected, pressureValue),
    generatedAt: new Date().toISOString(),
  };
};

export const mergeReadinessMatrix = (
  tenant: string,
  snapshots: readonly ReadinessSnapshot[],
): ReadinessMatrix => {
  const trend = snapshots.reduce((acc, snapshot) => acc + snapshot.score, 0) / Math.max(1, snapshots.length);
  const summaryParts = snapshots.map((snapshot) => `${snapshot.projection}:${snapshot.score.toFixed(2)}`);
  return {
    tenant,
    key: withBrand(`${tenant}:readiness:${Date.now()}`, 'ReadinessEnvelopeKey'),
    snapshots,
    trend: Number(trend.toFixed(4)),
    summary: summaryParts.join(' | '),
  };
};

export const buildReadinessProfile = (tenant: string, matrix: ReadinessMatrix): ReadinessProfile => {
  const byProjection = matrix.snapshots.reduce<Record<ReadinessProjection, number>>(
    (acc, snapshot) => {
      acc[snapshot.projection] += snapshot.score;
      return acc;
    },
    { stabilizing: 0, degrading: 0, critical: 0, unknown: 0 },
  );

  const worstProjection: ReadinessProjection = Object.entries(byProjection).reduce(
    (worst, [projection, score]) => {
      const current = byProjection[worst as ReadinessProjection] ?? 0;
      return score > current ? (projection as ReadinessProjection) : worst;
    },
    'unknown' as ReadinessProjection,
  );

  const averageScore = matrix.snapshots.reduce((acc, snapshot) => acc + snapshot.score, 0) / Math.max(1, matrix.snapshots.length);
  const averagePressure = matrix.snapshots.reduce((acc, snapshot) => acc + snapshot.pressure, 0) / Math.max(1, matrix.snapshots.length);

  return {
    tenant,
    windowMinutes: Math.max(5, matrix.snapshots.length * 15),
    snapshots: matrix.snapshots,
    averageScore: Number(averageScore.toFixed(4)),
    averagePressure: Number(averagePressure.toFixed(4)),
    worstProjection,
  };
};

export const projectReadiness = (sessions: readonly ReadinessSnapshot[]): ReadinessProjection => {
  if (!sessions.length) return 'unknown';
  const last = sessions[sessions.length - 1] ?? sessions[0]!;
  const head = sessions[0] ?? sessions[0]!;
  if ((last?.score ?? 0) > (head?.score ?? 0) + 0.1) return 'critical';
  if ((last?.score ?? 0) < (head?.score ?? 0) - 0.1) return 'stabilizing';
  return last?.projection ?? 'unknown';
};
