import type { RecoveryDrillHealthMetric, RecoveryDrillTimelinePoint } from './types';

export interface HealthBand {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly severity: 'ok' | 'warning' | 'alarm';
}

export interface TimelineDigest {
  readonly start: string;
  readonly end: string;
  readonly samples: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly trend: 'up' | 'down' | 'flat';
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const classifyMetricHealth = (metric: RecoveryDrillHealthMetric): HealthBand => {
  const span = metric.maxSafe - metric.minSafe;
  const offset = span <= 0 ? 0 : (metric.current - metric.baseline) / span;

  if (offset <= 0.2) {
    return {
      value: metric.current,
      min: metric.minSafe,
      max: metric.maxSafe,
      severity: 'ok',
    };
  }
  if (offset <= 0.5) {
    return {
      value: metric.current,
      min: metric.minSafe,
      max: metric.maxSafe,
      severity: 'warning',
    };
  }
  return {
    value: metric.current,
    min: metric.minSafe,
    max: metric.maxSafe,
    severity: 'alarm',
  };
};

export const normalizeToTimeline = (
  points: readonly RecoveryDrillTimelinePoint[],
): TimelineDigest => {
  if (points.length === 0) {
    const now = new Date().toISOString();
    return {
      start: now,
      end: now,
      samples: 0,
      min: 0,
      max: 0,
      avg: 0,
      trend: 'flat',
    };
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const first = values[0];
  const last = values[values.length - 1];

  const trend = last > first ? 'up' : last < first ? 'down' : 'flat';

  return {
    start: points[0]?.at ?? new Date().toISOString(),
    end: points[points.length - 1]?.at ?? new Date().toISOString(),
    samples: points.length,
    min: clamp(min, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
    max: clamp(max, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
    avg,
    trend,
  };
};

export const computeHealthScore = (metrics: readonly RecoveryDrillHealthMetric[]): number => {
  if (!metrics.length) return 100;

  const weighted = metrics.reduce((acc, metric, index) => {
    const band = classifyMetricHealth(metric);
    const severity = band.severity === 'ok' ? 100 : band.severity === 'warning' ? 70 : 30;
    const weight = index === 0 ? 2 : 1;
    return acc + severity * weight;
  }, 0);

  const divisor = metrics.length + Math.max(0, metrics.length - 1);
  return Math.max(0, Math.min(100, Math.round(weighted / divisor)));
};
