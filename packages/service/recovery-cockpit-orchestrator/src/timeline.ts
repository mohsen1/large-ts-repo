import { RecoveryPlan, ReadinessWindow, ReadinessEnvelope } from '@domain/recovery-cockpit-models';
import { buildPlanForecast } from '@domain/recovery-cockpit-intelligence';

export type TimelinePoint = {
  at: string;
  score: number;
  status: 'ok' | 'warn' | 'critical';
};

export type CockpitTimeline = {
  planId: string;
  points: readonly TimelinePoint[];
  summary: number;
};

const normalize = (value: number): number => Math.max(0, Math.min(100, value));

const deriveStatus = (score: number): TimelinePoint['status'] => {
  if (score >= 80) return 'ok';
  if (score >= 55) return 'warn';
  return 'critical';
};

export const buildTimeline = (plan: RecoveryPlan): CockpitTimeline => {
  const forecast = buildPlanForecast(plan, 'balanced');
  const points = forecast.windows.map((window) => ({
    at: window.at,
    score: normalize(window.value),
    status: deriveStatus(window.value),
  }));
  const summary = points.reduce((acc, point) => acc + point.score, 0) / Math.max(1, points.length);
  return {
    planId: plan.planId,
    points,
    summary: Number(summary.toFixed(2)),
  };
};

export const buildEnvelope = (planId: string, points: readonly ReadinessWindow[]): ReadinessEnvelope => {
  const envelope: ReadinessEnvelope = {
    planId: planId as any,
    namespace: 'ops',
    baselineScore: points.length === 0 ? 100 : points[0].score,
    windows: points,
  };
  return envelope;
};

export const renderTimelineSummary = (timeline: CockpitTimeline): string =>
  `${timeline.planId} health average ${timeline.summary.toFixed(1)} over ${timeline.points.length} points`;
