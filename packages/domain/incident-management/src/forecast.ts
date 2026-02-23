import { z } from 'zod';
import { IncidentRecord, IncidentSeverity } from './types';

const severityWeights: Record<IncidentSeverity, number> = {
  sev1: 4,
  sev2: 3,
  sev3: 2,
  sev4: 1,
};

const toSeverityWeight = (severity: IncidentSeverity): number => severityWeights[severity];

export const forecastConfidenceSchema = z.number().min(0).max(1);

export interface ForecastSignalWindow {
  readonly at: string;
  readonly value: number;
  readonly confidence: number;
  readonly signal: string;
}

export interface ForecastInput {
  readonly tenantId: string;
  readonly serviceId: string;
  readonly incident: IncidentRecord;
  readonly windowSizeMinutes: number;
  readonly horizonMinutes: number;
}

export interface ForecastOutput {
  readonly tenantId: string;
  readonly serviceId: string;
  readonly severityWeight: number;
  readonly confidence: number;
  readonly predictedPeakAt: string;
  readonly peakScore: number;
  readonly windows: ForecastSignalWindow[];
  readonly requiresManualReview: boolean;
}

export interface ForecastConfig {
  readonly decayFactor: number;
  readonly surgeMultiplier: number;
  readonly volatilityBias: number;
}

const defaultConfig: ForecastConfig = {
  decayFactor: 0.82,
  surgeMultiplier: 1.6,
  volatilityBias: 0.15,
};

const predictPeakWindow = (
  baseMinutes: number,
  weight: number,
  config: ForecastConfig,
): number => {
  const decayed = Math.max(1, baseMinutes * config.decayFactor);
  const surge = Math.max(1, weight * config.surgeMultiplier);
  const volatility = Math.max(1, 1 + config.volatilityBias);
  return Math.round(decayed * surge * volatility);
};

const buildWindowScore = (
  baseSeverityWeight: number,
  index: number,
  config: ForecastConfig,
): number => {
  const trend = 1 + (Math.sin(index) + 1) / 6;
  const noise = (Math.cos(index * 2) + 1) / 8;
  return Number((baseSeverityWeight * config.surgeMultiplier * trend * (1 + config.volatilityBias) + noise).toFixed(3));
};

export const normalizeConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

export const buildForecast = (input: ForecastInput, config = defaultConfig): ForecastOutput => {
  const now = Date.now();
  const horizonSlots = Math.max(1, Math.floor(input.horizonMinutes / input.windowSizeMinutes));
  const severityWeight = toSeverityWeight(input.incident.triage.severity);
  const baseWindowScore = input.incident.triage.confidence * severityWeight + 0.75;
  const windows: ForecastSignalWindow[] = [];

  let total = 0;
  for (let index = 0; index < horizonSlots; index += 1) {
    const value = buildWindowScore(baseWindowScore, index, config);
    const confidence = normalizeConfidence(
      (1 - config.decayFactor) + config.decayFactor * (input.incident.triage.confidence + index / horizonSlots / 3),
    );
    total += value;
    const at = new Date(now + index * input.windowSizeMinutes * 60 * 1000).toISOString();
    windows.push({
      at,
      value,
      confidence,
      signal: `${input.serviceId}:${input.incident.tenantId}`,
    });
  }

  const peakScore = Math.max(...windows.map((entry) => entry.value), 0);
  const peak = windows.find((entry) => entry.value === peakScore) ?? windows[0]!;
  const confidence = normalizeConfidence(total / windows.length / 10);
  const requiresManualReview = peakScore > 6 || confidence < 0.45;
  const predictedPeakOffset = predictPeakWindow(30, severityWeight, config) + (requiresManualReview ? 12 : 0);
  const predictedPeakAt = new Date(now + predictedPeakOffset * 60 * 1000).toISOString();

  return {
    tenantId: input.tenantId,
    serviceId: input.serviceId,
    severityWeight,
    confidence,
    predictedPeakAt,
    peakScore,
    windows,
    requiresManualReview,
  };
};

export const forecastByIncidentBatch = (
  items: readonly IncidentRecord[],
  windowSizeMinutes: number,
  horizonMinutes: number,
): ForecastOutput[] => {
  return items.map((incident) =>
    buildForecast(
      {
        tenantId: incident.tenantId,
        serviceId: incident.serviceId,
        incident,
        windowSizeMinutes,
        horizonMinutes,
      },
      {
        decayFactor: 0.74,
        surgeMultiplier: 1.45,
        volatilityBias: 0.22,
      },
    ),
  );
};
