import type { ReadinessSignal } from '@domain/recovery-readiness';
import type { SignalDensityPoint } from './types';

export interface ForecastProfile {
  readonly points: readonly SignalDensityPoint[];
  readonly totalSignals: number;
  readonly averageSignalsPerMinute: number;
}

const severityToWeight = (signal: ReadinessSignal): number => {
  switch (signal.severity) {
    case 'critical':
      return 8;
    case 'high':
      return 4;
    case 'medium':
      return 2;
    default:
      return 1;
  }
};

export const forecastDensity = (signals: readonly ReadinessSignal[]): ForecastProfile => {
  const points: SignalDensityPoint[] = Array.from({ length: 60 }, (_, minute) => {
    const bucket = signals.filter((signal) => new Date(signal.capturedAt).getUTCMinutes() === minute);
    const weightedSeverity = bucket.reduce((sum, signal) => sum + severityToWeight(signal), 0);
    return {
      minute,
      signals: bucket.length,
      weightedSeverity,
    };
  });

  const total = points.reduce((sum, point) => sum + point.signals, 0);
  const average = total / 60;
  return { points, totalSignals: total, averageSignalsPerMinute: average };
};
