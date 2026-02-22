import { Brand, normalizeLimit, withBrand } from '@shared/core';
import { clamp } from '@domain/incident-signal-intelligence';
import type {
  SignalEnvelope,
  SignalKind,
  SignalId,
  SignalVector,
  TenantId,
  SignalRiskProfile,
} from '@domain/incident-signal-intelligence';

export const analyticsModes = ['monitor', 'incident', 'forecast', 'drill'] as const;
export const confidenceBands = ['low', 'medium', 'high', 'critical'] as const;
export type AnalyticsMode = (typeof analyticsModes)[number];
export type ConfidenceBand = (typeof confidenceBands)[number];

export type TenantAnalyticsId = Brand<string, 'TenantAnalyticsId'>;
export type AnalyticsSignalId = Brand<string, 'AnalyticsSignalId'>;
export type RecommendationId = Brand<string, 'AnalyticsRecommendationId'>;
export type SignalClusterId = Brand<string, 'SignalClusterId'>;

export const createTenantAnalyticsId = (tenantId: string): TenantAnalyticsId => `${tenantId}:tenant-analytics` as TenantAnalyticsId;
export const createRecommendationId = (seed: string): RecommendationId => `${seed}:recommendation:${Date.now()}` as RecommendationId;
export const createClusterId = (tenantId: TenantId, kind: SignalKind): SignalClusterId =>
  `${tenantId}:${kind}:cluster` as SignalClusterId;

export const isNumeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export interface IncidentSignalAnalyticsInput {
  readonly tenantId: TenantId;
  readonly signalIds: readonly SignalId[];
  readonly horizonMinutes: number;
  readonly lookbackMinutes: number;
  readonly minConfidence: number;
  readonly modes: readonly AnalyticsMode[];
}

export interface SignalTrendPoint {
  readonly bucketStart: string;
  readonly bucketEnd: string;
  readonly avgMagnitude: number;
  readonly maxMagnitude: number;
  readonly volatility: number;
  readonly sampleCount: number;
}

export interface SignalCluster {
  readonly id: SignalClusterId;
  readonly tenantId: TenantId;
  readonly kind: SignalKind;
  readonly averageRisk: number;
  readonly trend: readonly SignalTrendPoint[];
  readonly confidence: number;
  readonly confidenceBand: ConfidenceBand;
  readonly signals: readonly SignalId[];
}

export interface RecommendationAction {
  readonly id: Brand<string, 'RecommendationActionId'>;
  readonly command: 'notify' | 'scale' | 'investigate' | 'shift' | 'drain';
  readonly target: string;
  readonly urgency: number;
  readonly estimatedMinutes: number;
}

export interface ActionableRecommendation {
  readonly id: RecommendationId;
  readonly tenantId: TenantId;
  readonly title: string;
  readonly rationale: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly confidence: number;
  readonly risk: SignalRiskProfile['riskBand'];
  readonly actions: readonly RecommendationAction[];
  readonly affectedSignalCount: number;
}

export interface TenantSignalMatrix {
  readonly tenantId: TenantAnalyticsId;
  readonly clusters: readonly SignalCluster[];
  readonly recommendations: readonly ActionableRecommendation[];
  readonly rawSignals: readonly SignalEnvelope[];
}

export interface SignalForecastPoint {
  readonly windowStart: string;
  readonly projectedMagnitude: number;
  readonly projectedRiskBand: SignalRiskProfile['riskBand'];
}

export interface ApiSignalProjection {
  readonly windowStart: string;
  readonly projectedMagnitude: number;
  readonly risk: SignalRiskProfile['riskBand'];
}

export interface IncidentAnalyticsSnapshot {
  readonly generatedAt: string;
  readonly tenantId: TenantId;
  readonly mode: AnalyticsMode;
  readonly matrix: TenantSignalMatrix;
  readonly forecast: readonly SignalForecastPoint[];
  readonly totalSignals: number;
  readonly alertScore: number;
}

export const normalizeConfidence = (value: number): number => clamp(value, 0, 1);

export const confidenceBandFrom = (value: number): ConfidenceBand => {
  if (value >= 0.9) {
    return 'critical';
  }
  if (value >= 0.7) {
    return 'high';
  }
  if (value >= 0.45) {
    return 'medium';
  }
  return 'low';
};

export const ensureSignalBucketRange = (input: {
  readonly from: string;
  readonly to: string;
}): { from: string; to: string } => {
  if (input.from > input.to) {
    return { from: input.to, to: input.from };
  }
  return input;
};

export const normalizeSignalVector = (raw: SignalVector): SignalVector => ({
  magnitude: clamp(raw.magnitude, 0, 1),
  variance: clamp(raw.variance, 0, 1),
  entropy: clamp(raw.entropy, 0, 1),
});

export const buildAnalyticsWindow = (windowMinutes: number): number => {
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    return 15;
  }
  return normalizeLimit(windowMinutes);
};

export const parseAnalyticsInput = (input: unknown): IncidentSignalAnalyticsInput => {
  const parsed = input as IncidentSignalAnalyticsInput;
  return {
    tenantId: parsed.tenantId as TenantId,
    signalIds: parsed.signalIds as readonly SignalId[],
    horizonMinutes: isNumeric(parsed.horizonMinutes) ? parsed.horizonMinutes : 60,
    lookbackMinutes: isNumeric(parsed.lookbackMinutes) ? parsed.lookbackMinutes : 120,
    minConfidence: isNumeric(parsed.minConfidence) ? parsed.minConfidence : 0.5,
    modes: parsed.modes ?? ['monitor'],
  };
};

export const normalizeSnapshotGeneratedAt = (snapshot: IncidentAnalyticsSnapshot): string =>
  snapshot.generatedAt || new Date().toISOString();

export const ensureTenantAnalyticsId = (tenantId: TenantId): TenantAnalyticsId =>
  withBrand(`${tenantId}:tenant-analytics`, 'TenantAnalyticsId');
