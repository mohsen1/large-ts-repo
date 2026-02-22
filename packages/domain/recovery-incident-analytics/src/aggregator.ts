import { withBrand } from '@shared/core';
import {
  clamp,
  type SignalEnvelope,
  type SignalId,
  type SignalKind,
  type SignalRiskProfile,
  type TenantId,
  type SignalVector,
} from '@domain/incident-signal-intelligence';
import type { SignalCluster, SignalTrendPoint, IncidentSignalAnalyticsInput, IncidentAnalyticsSnapshot } from './types';
import { buildAnalyticsWindow, confidenceBandFrom, createClusterId, normalizeConfidence, parseAnalyticsInput } from './types';

export interface SignalAggregationOptions {
  readonly tenantId: TenantId;
  readonly lookbackMinutes: number;
  readonly minConfidence: number;
}

const normalizeBucket = (count: number, windowMinutes: number): number => {
  if (count === 0) {
    return 0;
  }
  const denominator = Math.max(1, windowMinutes / 15);
  return Math.max(1, Math.floor(count / denominator));
};

const computeSignalTrend = (signals: readonly SignalEnvelope[], windowMinutes: number): readonly SignalTrendPoint[] => {
  const sorted = [...signals].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const bucketCount = normalizeBucket(sorted.length, windowMinutes);
  const windows: SignalTrendPoint[] = [];
  const start = Date.now();

  for (let index = 0; index < sorted.length; index += bucketCount || 1) {
    const bucketSignals = sorted.slice(index, index + (bucketCount || 1));
    const vectors: readonly SignalVector[] = bucketSignals.map((signal) => signal.vector);
    const count = vectors.length || 1;
    const avgMagnitude = vectors.reduce((sum, vector) => sum + clamp(vector.magnitude, 0, 1), 0) / count;
    const maxMagnitude = vectors.reduce((max, vector) => Math.max(max, clamp(vector.magnitude, 0, 1)), 0);
    const variance = vectors.reduce((sum, vector) => {
      const delta = clamp(vector.magnitude, 0, 1) - avgMagnitude;
      return sum + delta * delta;
    }, 0) / count;

    windows.push({
      bucketStart: new Date(start + index * windowMinutes * 60_000).toISOString(),
      bucketEnd: new Date(start + (index + 1) * windowMinutes * 60_000).toISOString(),
      avgMagnitude: Number(avgMagnitude.toFixed(4)),
      maxMagnitude: Number(maxMagnitude.toFixed(4)),
      volatility: Number(Math.sqrt(variance).toFixed(4)),
      sampleCount: bucketSignals.length,
    });
  }

  return windows;
};

export const buildBuckets = (
  signals: readonly SignalEnvelope[],
  windowMinutes: number,
): Record<string, readonly SignalTrendPoint[]> => {
  const grouped = new Map<string, SignalEnvelope[]>();

  for (const signal of signals) {
    const bucket = grouped.get(signal.kind) ?? [];
    bucket.push(signal);
    grouped.set(signal.kind, bucket);
  }

  const buckets: Record<string, readonly SignalTrendPoint[]> = {};
  for (const [kind, values] of grouped.entries()) {
    buckets[kind] = computeSignalTrend(values, Math.max(5, windowMinutes));
  }
  return buckets;
};

const buildCluster = (
  tenantId: TenantId,
  kind: SignalKind,
  signals: readonly SignalEnvelope[],
  profiles: readonly SignalRiskProfile[],
): SignalCluster => {
  const signalIds = signals.map((signal) => signal.id);
  const kindProfiles = profiles.filter((profile) => signalIds.includes(profile.signalId));
  const totalProfiles = Math.max(1, kindProfiles.length);
  const averageRisk = kindProfiles.reduce((sum, profile) => sum + profile.impactScore, 0) / totalProfiles;
  const confidence = normalizeConfidence(
    kindProfiles.reduce((sum, profile) => sum + profile.confidence, 0) / totalProfiles,
  );
  const trend = computeSignalTrend(signals, buildAnalyticsWindow(30));
  const riskBand = confidenceBandFrom(confidence);

  return {
    id: createClusterId(tenantId, kind),
    tenantId,
    kind,
    averageRisk: Number(averageRisk.toFixed(4)),
    trend,
    confidence,
    confidenceBand: riskBand,
    signals: signalIds,
  };
};

const parseInput = (input: IncidentSignalAnalyticsInput): SignalAggregationOptions => ({
  tenantId: input.tenantId,
  lookbackMinutes: input.lookbackMinutes,
  minConfidence: input.minConfidence,
});

const buildForecast = (signals: readonly SignalVector[], limit: number): IncidentAnalyticsSnapshot['forecast'] => {
  const bounded = signals.slice(0, Math.max(1, limit));
  return bounded.map((signal, index) => {
    const projected = clamp(
      signal.magnitude * (1 - index / Math.max(1, bounded.length + 1)) + signal.variance * 0.05,
      0,
      1,
    );
    const projectedMagnitude = Number(projected.toFixed(4));
    return {
      windowStart: new Date(Date.now() + index * 60_000).toISOString(),
      projectedMagnitude,
      projectedRiskBand: projectedMagnitude > 0.75
        ? 'critical'
        : projectedMagnitude > 0.5
          ? 'high'
          : projectedMagnitude > 0.2
            ? 'moderate'
            : 'low',
    };
  });
};

const buildRecommendations = (clusters: readonly SignalCluster[]) =>
  clusters
    .filter((cluster) => cluster.confidenceBand !== 'low')
    .map((cluster, index) => ({
      id: withBrand(`${cluster.id}:recommendation:${index}`, 'AnalyticsRecommendationId'),
      tenantId: cluster.tenantId,
      title: `Stabilize ${cluster.kind} channel`,
      rationale: `${cluster.signals.length} signals over ${cluster.trend.length} windows`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      confidence: cluster.confidence,
      risk: (cluster.confidenceBand === 'high' || cluster.confidenceBand === 'critical'
        ? 'high'
        : 'moderate') as SignalRiskProfile['riskBand'],
      actions: [
        {
          id: withBrand(`${cluster.id}:action:notify`, 'RecommendationActionId'),
          command: 'notify' as const,
          target: cluster.id,
          urgency: Math.max(1, Math.min(5, Math.round(cluster.averageRisk * 10))),
          estimatedMinutes: 30,
        },
        {
          id: withBrand(`${cluster.id}:action:investigate`, 'RecommendationActionId'),
          command: 'investigate' as const,
          target: cluster.id,
          urgency: Math.max(1, Math.min(4, Math.floor(cluster.confidence * 5))),
          estimatedMinutes: 60,
        },
      ],
      affectedSignalCount: cluster.signals.length,
    }));

export const synthesizeAnalyticsSnapshot = (
  input: IncidentSignalAnalyticsInput,
  riskProfiles: readonly SignalRiskProfile[],
  rawSignals: readonly SignalEnvelope[],
): IncidentAnalyticsSnapshot => {
  const options = parseInput(input);
  const parsed = parseAnalyticsInput({
    tenantId: String(options.tenantId),
    signalIds: rawSignals.map((signal) => signal.id as unknown as SignalId),
    lookbackMinutes: input.lookbackMinutes,
    horizonMinutes: input.horizonMinutes,
    minConfidence: input.minConfidence,
    modes: input.modes,
  });
  const buckets = buildBuckets(rawSignals, buildAnalyticsWindow(options.lookbackMinutes));

  const clusters = Object.entries(buckets).map(([kind, trend]) => {
    const signals = rawSignals.filter((signal) => signal.kind === kind);
    const cluster = buildCluster(parsed.tenantId, kind as SignalKind, signals, riskProfiles);
    return {
      ...cluster,
      trend,
    };
  });

  const forecastInput = rawSignals.map((signal) => signal.vector);
  const forecast = buildForecast(forecastInput, options.lookbackMinutes / 30);
  const recommendations = buildRecommendations(clusters);
  const totalSignals = rawSignals.length;
  const alertScore = clusters.length === 0 ? 0 : Number(
    (clusters.reduce((sum, cluster) => sum + cluster.confidence * (cluster.confidenceBand === 'high' || cluster.confidenceBand === 'critical' ? 2 : 1), 0)
      / clusters.length).toFixed(4),
  );

  return {
    generatedAt: new Date().toISOString(),
    tenantId: parsed.tenantId,
    mode: parsed.modes[0] ?? 'monitor',
    matrix: {
      tenantId: withBrand(`${parsed.tenantId}:matrix`, 'TenantAnalyticsId'),
      clusters,
      recommendations,
      rawSignals,
    },
    forecast,
    totalSignals,
    alertScore,
  };
};

export const aggregateSignalProfiles = (
  signalIds: readonly string[],
  profiles: readonly SignalRiskProfile[],
): Record<string, SignalRiskProfile[]> => {
  const buckets = new Map<string, SignalRiskProfile[]>();
  for (const profile of profiles) {
    if (!signalIds.includes(String(profile.signalId))) {
      continue;
    }
    const bucket = buckets.get(String(profile.riskBand)) ?? [];
    bucket.push(profile);
    buckets.set(String(profile.riskBand), bucket);
  }
  return Object.fromEntries(buckets.entries());
};
