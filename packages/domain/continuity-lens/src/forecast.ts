import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import { buildBuckets, buildWindow } from './temporal';
import { graphCriticality } from './graph';
import type {
  ContinuityForecast,
  ContinuityForecastRequest,
  ContinuityRiskEvent,
  ContinuitySnapshot,
  ContinuitySignal,
  ContinuityTenantId,
  ContinuityWindow,
} from './types';

const movingAverage = (values: readonly number[], windowSize = 3): number[] => {
  const output: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    const next = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    output.push(Number(next.toFixed(4)));
  }
  return output;
};

const inferTrend = (history: readonly number[]): ContinuityForecast['trend'] => {
  if (history.length < 2) return 'flat';
  const delta = (history.at(-1) ?? 0) - (history[0] ?? 0);
  if (delta > 8) return 'degrading';
  if (delta < -8) return 'stabilizing';
  if (Math.abs(delta) < 2) return 'flat';
  return 'volatile';
};

const topRiskSignals = (signals: readonly ContinuitySignal[]): readonly ContinuitySignal[] =>
  [...signals].sort((left, right) => right.severity - left.severity).slice(0, 12);

export const buildForecast = (
  tenantId: ContinuityTenantId,
  snapshots: readonly ContinuitySnapshot[],
  request: ContinuityForecastRequest,
): Result<ContinuityForecast, Error> => {
  if (request.horizonMinutes <= 0) return fail(new Error('horizon must be positive'));
  if (snapshots.length === 0) return fail(new Error('no snapshots'));

  const allSignals = snapshots.flatMap((snapshot) => snapshot.signals);
  if (allSignals.length === 0) return fail(new Error('no signals'));

  const window: ContinuityWindow = buildWindow({
    tenantId,
    from: snapshots[0]?.windowStart ?? new Date().toISOString(),
    to: new Date(
      Date.parse(snapshots[snapshots.length - 1]?.windowEnd ?? new Date().toISOString()) +
        request.horizonMinutes * 60_000,
    ).toISOString(),
    horizonMinutes: request.horizonMinutes,
  });

  const bucketSummary = buildBuckets(
    {
      tenantId,
      from: window.from,
      to: window.to,
      horizonMinutes: window.horizonMinutes,
    },
    snapshots,
  );

  const scoreSeries = movingAverage(bucketSummary.buckets.map((entry) => Math.max(0, Math.min(100, entry.count * 12))), 3);
  const trend = inferTrend(scoreSeries);
  const topSignals = topRiskSignals(allSignals.filter((signal) => request.includeResolved || signal.state !== 'resolved')).slice(
    0,
    request.maxSignals ?? 120,
  );
  const baseRisk = graphCriticality({
    tenantId,
    signalIds: topSignals.map((signal) => signal.id),
    edges: [],
    orderedByTime: topSignals.map((signal) => signal.id),
    cycleFree: true,
  });

  const hotspots: ContinuityRiskEvent[] = topSignals.map((signal, index) => ({
    id: withBrand(`${signal.id}:hotspot:${index}`, 'ContinuityRiskEventId'),
    tenantId: signal.tenantId,
    signalId: signal.id,
    confidence: Number(Math.min(1, signal.severity / 100).toFixed(4)),
    risk: signal.risk,
    cause: signal.title,
    observedAt: signal.reportedAt,
  }));

  const projectedRiskIndex = Number(((scoreSeries.at(-1) ?? baseRisk) + baseRisk / 4).toFixed(4));

  return ok({
    tenantId,
    window,
    projectedRiskIndex,
    trend,
    hotspots,
    recommendations: [
      'Increase correlation depth on highest risk cluster',
      'Throttle non-critical commands while volatility is elevated',
      'Escalate policy review for top-risk signals',
    ],
  });
};
