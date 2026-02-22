import type { ReadinessForecast, ReadinessRunId } from './types';
import { weightedRiskDensity, summarizeProfiles } from './signal-matrix';
import type { ReadinessSignal } from './types';

export interface ForecastCheckpoint {
  index: number;
  projection: number;
  confidence: number;
}

export interface ForecastOptions {
  baseSignalDensity: number;
  volatilityWindowMinutes: number;
}

export interface ForecastPlan {
  forecast: ReadinessForecast;
  confidenceBand: {
    low: number;
    high: number;
  };
  checkpoints: ForecastCheckpoint[];
}

export function projectSignals(
  runId: ReadinessRunId,
  signals: readonly ReadinessSignal[],
  options: ForecastOptions,
): ForecastPlan {
  const density = weightedRiskDensity(signals);
  const profiles = summarizeProfiles(signals);
  const volatility = Math.min(profiles.length, 1) === 0 ? 1 : Math.min(8, Math.max(1, profiles.length));
  const horizonMinutes = Math.max(15, options.volatilityWindowMinutes);
  const step = Math.max(1, Math.floor(horizonMinutes / 6));

  const checkpointCount = Math.max(1, Math.floor(horizonMinutes / step));
  const checkpoints = Array.from({ length: checkpointCount }, (_, index) => {
    const projection = density * (1 + ((index + 1) / Math.max(1, checkpointCount)) * (volatility / 10));
    const confidence = Number((Math.min(0.98, 0.3 + (1 / (index + 1))) * 100).toFixed(0));
    return {
      index,
      projection: Number(projection.toFixed(2)),
      confidence: confidence / 100,
    };
  });

  const confidence = Math.min(0.95, Math.max(0.45, 1 / Math.max(1, volatility)));
  const projectedSignals = Array.from({ length: 8 }, (_, index) => ({
    ts: new Date(Date.now() + index * 60000).toISOString(),
    value: density * (1 + index * 0.08)
  }));

  const forecast: ReadinessForecast = {
    runId,
    horizonMinutes,
    projectedSignals,
    confidence,
  };

  return {
    forecast,
    confidenceBand: {
      low: Number((forecast.confidence * 0.4).toFixed(3)),
      high: Number((Math.min(1, forecast.confidence * 1.75)).toFixed(3)),
    },
    checkpoints,
  };
}
