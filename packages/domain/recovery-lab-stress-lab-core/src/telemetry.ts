import { summarizeByIterator } from '@shared/orchestration-lab-core';
import type { ChaosTelemetry } from './contracts';

export interface TelemetrySummary {
  readonly scope: string;
  readonly metric: number;
  readonly signals: number;
  readonly phase: string;
}

export interface WindowSummary {
  readonly points: readonly TelemetrySummary[];
  readonly minMetric: number;
  readonly maxMetric: number;
  readonly averageMetric: number;
}

const asNumeric = (telemetry: ChaosTelemetry): number => telemetry.metric;

const compute = (values: readonly number[]): { min: number; max: number; average: number } => {
  if (values.length === 0) {
    return { min: 0, max: 0, average: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((acc, next) => acc + next, 0) / values.length;
  return { min, max, average };
};

export const summarizeTelemetry = (telemetry: readonly ChaosTelemetry[]): WindowSummary => {
  const points = telemetry.map((entry) => ({
    scope: entry.scope,
    metric: asNumeric(entry),
    signals: entry.signalCount,
    phase: entry.phase,
  }));
  const metricValues = points.map((point) => point.metric);
  const stats = compute(metricValues);
  return {
    points,
    minMetric: stats.min,
    maxMetric: stats.max,
    averageMetric: stats.average,
  };
};

export const telemetryByPhase = (telemetry: readonly ChaosTelemetry[]): Record<string, WindowSummary> => {
  const grouped = summarizeByIterator(telemetry, (entry) => entry.phase);
  const matrix: Record<string, WindowSummary> = {};
  for (const [phase, _count] of grouped) {
    const bucket = telemetry.filter((entry) => entry.phase === phase);
    matrix[phase] = summarizeTelemetry(bucket);
  }
  return matrix;
};
