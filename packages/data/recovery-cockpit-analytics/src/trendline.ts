import { PlanAnalyticsRow } from './schema';
import { UtcIsoTimestamp } from '@domain/recovery-cockpit-models';

export type TrendDirection = 'improving' | 'stable' | 'degrading';

export type TrendPoint = {
  readonly planId: string;
  readonly at: UtcIsoTimestamp;
  readonly direction: TrendDirection;
  readonly delta: number;
  readonly score: number;
  readonly risk: number;
};

export type TrendSummary = {
  readonly planId: string;
  readonly points: readonly TrendPoint[];
  readonly direction: TrendDirection;
  readonly netDelta: number;
  readonly summary: string;
};

const trend = (points: readonly TrendPoint[]): TrendDirection => {
  if (points.length < 2) {
    return 'stable';
  }
  const first = points[0]?.risk ?? 0;
  const last = points[points.length - 1]?.risk ?? first;
  if (last < first - 5) return 'improving';
  if (last > first + 5) return 'degrading';
  return 'stable';
};

export const buildTrendline = (rows: readonly PlanAnalyticsRow[]): TrendSummary => {
  if (rows.length === 0) {
    return {
      planId: 'none',
      points: [],
      direction: 'stable',
      netDelta: 0,
      summary: 'empty',
    };
  }

  const points: TrendPoint[] = rows.map((row) => ({
    planId: row.planId,
    at: row.at,
    risk: row.risk,
    direction: 'stable' as TrendDirection,
    delta: 0,
    score: row.readinessScore,
  }));

  const normalized = points.map((point, index) => {
    const previous = points[index - 1]?.risk;
    const delta = previous === undefined ? 0 : point.risk - previous;
    const direction: TrendDirection = delta <= -5 ? 'improving' : delta >= 5 ? 'degrading' : 'stable';
    return { ...point, direction, delta };
  });

  const direction = trend(normalized);
  const netDelta = normalized.reduce((acc, point) => acc + point.delta, 0);

  return {
    planId: rows[0].planId,
    points: normalized,
    direction,
    netDelta: Number(netDelta.toFixed(2)),
    summary: `${rows[0].planId} ${direction} net=${netDelta.toFixed(2)} points=${normalized.length}`,
  };
};

export const mergeTrend = (summaries: readonly TrendSummary[]): string =>
  summaries
    .map((summary) => `${summary.planId}:${summary.direction}:${summary.netDelta.toFixed(2)}`)
    .join(' | ');

export const latestPoint = (rows: readonly PlanAnalyticsRow[]): TrendPoint | undefined => {
  const last = rows.at(-1);
  if (!last) return;
  return {
    planId: last.planId,
    at: last.at,
    direction: 'stable',
    delta: 0,
    risk: last.risk,
    score: last.readinessScore,
  };
};
