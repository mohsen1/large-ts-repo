import {
  type IncidentAnalyticsSnapshot,
  type SignalForecastPoint,
  type RecommendationAction,
  type ApiSignalProjection,
  confidenceBandFrom,
  createRecommendationId,
} from './types';
import { withBrand } from '@shared/core';
import type { SignalVector } from '@domain/incident-signal-intelligence';

export interface ApiKpi {
  readonly tenantId: string;
  readonly totalSignals: number;
  readonly alertScore: number;
  readonly recommendationCount: number;
  readonly criticalAlerts: number;
}

export interface ApiSignalTile {
  readonly id: string;
  readonly band: string;
  readonly trend: number;
  readonly confidence: number;
  readonly actions: readonly {
    readonly command: RecommendationAction['command'];
    readonly target: string;
    readonly urgency: number;
  }[];
}

export interface SignalUiContract {
  readonly kpis: ApiKpi;
  readonly projections: readonly {
    readonly windowStart: string;
    readonly projectedMagnitude: number;
    readonly risk: string;
  }[];
  readonly recommendations: readonly ApiSignalTile[];
}

export interface SignalApiEnvelope {
  readonly projections: readonly ApiSignalProjection[];
}

const safeParseNumber = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value;
};

export const toKpiCard = (snapshot: IncidentAnalyticsSnapshot): ApiKpi => {
  const criticalRisk = snapshot.matrix.clusters.reduce(
    (total, cluster) => total + (cluster.averageRisk > 0.75 ? 1 : 0),
    0,
  );
  return {
    tenantId: String(snapshot.tenantId),
    totalSignals: snapshot.totalSignals,
    alertScore: snapshot.alertScore,
    recommendationCount: snapshot.matrix.recommendations.length,
    criticalAlerts: criticalRisk,
  };
};

export const toUiProjection = (points: readonly SignalForecastPoint[]) =>
  points.map((point) => ({
    windowStart: point.windowStart,
    projectedMagnitude: point.projectedMagnitude,
    risk: point.projectedRiskBand,
  }));

export const toUiRecommendations = (snapshot: IncidentAnalyticsSnapshot): readonly ApiSignalTile[] =>
  snapshot.matrix.recommendations.map((entry) => {
    const band = confidenceBandFrom(entry.confidence);
    const trend = Number((entry.confidence * 100).toFixed(2));
    return {
      id: createRecommendationId(`${entry.id}:ui`),
      band,
      trend,
      confidence: safeParseNumber(entry.confidence),
      actions: entry.actions.map((action) => ({
        command: action.command,
        target: action.target,
        urgency: action.urgency,
      })),
    };
  });

export const serializeForApi = (snapshot: IncidentAnalyticsSnapshot): string => {
  const payload: SignalUiContract = {
    kpis: toKpiCard(snapshot),
    projections: toUiProjection(snapshot.forecast),
    recommendations: toUiRecommendations(snapshot),
  };
  return JSON.stringify(payload);
};

export const validateApiPayload = (value: string): SignalUiContract => {
  const decoded = JSON.parse(value) as SignalUiContract;
  if (!decoded?.kpis || !Array.isArray(decoded.projections) || !Array.isArray(decoded.recommendations)) {
    throw new Error('invalid analytics payload');
  }
  return decoded;
};

export const toSignalVectors = (points: readonly SignalForecastPoint[]): readonly SignalVector[] =>
  points.map((point) => ({
    magnitude: point.projectedMagnitude,
    variance: point.projectedMagnitude * 0.5,
    entropy: 1 - point.projectedMagnitude,
  }));

export const buildCorrelationEnvelopeId = (tenantId: string, signalCount: number): string =>
  withBrand(`${tenantId}:correlation:${signalCount}:${Date.now()}`, 'ResultCode');
