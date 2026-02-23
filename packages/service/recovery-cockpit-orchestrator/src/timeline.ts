import { RecoveryPlan, ReadinessEnvelope, ReadinessWindow } from '@domain/recovery-cockpit-models';
import { computeReadiness } from '@domain/recovery-cockpit-models';

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

export const buildTimeline = (plan: RecoveryPlan, windows: readonly ReadinessWindow[]): CockpitTimeline => {
  const points = windows.map((window) => {
    const score = normalize(computeReadiness(100, window.expectedRecoveryMinutes + window.services.length));
    return {
      at: window.at,
      score,
      status: deriveStatus(score),
    };
  });
  const summary = points.reduce((acc, point) => acc + point.score, 0);
  return {
    planId: plan.planId,
    points,
    summary: Number((summary / Math.max(1, points.length)).toFixed(2)),
  };
};

export const buildEnvelope = (planId: string, points: readonly ReadinessWindow[]): ReadinessEnvelope => {
  const envelope: ReadinessEnvelope = {
    planId: planId as any,
    namespace: 'ops',
    baselineScore: points.length === 0 ? 100 : points[0].expectedRecoveryMinutes,
    windows: points,
  };
  return envelope;
};

export const renderTimelineSummary = (timeline: CockpitTimeline): string =>
  `${timeline.planId} health average ${timeline.summary.toFixed(1)} over ${timeline.points.length} points`;
