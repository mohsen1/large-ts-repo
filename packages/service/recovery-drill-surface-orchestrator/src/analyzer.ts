import type { DrillRunSnapshot, DrillRunStatus } from '@domain/recovery-drill-lab';
import type { SurfaceMetric } from './types';
import type { SurfaceAnalysis } from './types';
import { computeSnapshotAnalysis } from '@domain/recovery-drill-lab';

const toMetric = (label: string, value: number, weight: number): SurfaceMetric => ({
  label,
  value,
  weight,
  observedAt: new Date().toISOString(),
});

const toPercent = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / max) * 100));
};

const ratioToInt = (value: number): number => Math.round(value);

export const computeBlockers = (snapshot: DrillRunSnapshot): readonly DrillRunStatus[] => {
  const blockers: DrillRunStatus[] = [];
  for (const step of snapshot.steps) {
    if (step.status === 'warning' || step.status === 'failed') {
      blockers.push(snapshot.status);
      break;
    }
  }

  if (snapshot.riskBudgetPercent > 0.6) {
    blockers.push('paused');
  }

  return blockers;
};

export const scoreRun = (snapshot: DrillRunSnapshot): number => {
  const analysis = computeSnapshotAnalysis(snapshot);
  const completed = analysis.summary.healthScore;
  const riskPenalty = analysis.summary.riskScore;

  if (completed === 0) {
    return 0;
  }

  return Math.max(0, Math.round(completed - riskPenalty * 0.5));
};

export const riskRun = (snapshot: DrillRunSnapshot): number => {
  const analysis = computeSnapshotAnalysis(snapshot);
  const trendPenalty = Math.round(Math.abs(analysis.riskTrend));
  const dominantPenalty = analysis.dominantFamily === 'restore' ? 2 : 6;
  const framePenalty = analysis.frameCount * 3;
  return Math.max(0, Math.round(analysis.summary.riskScore + trendPenalty + dominantPenalty + framePenalty));
};

export const velocityRun = (snapshot: DrillRunSnapshot): number => {
  const started = snapshot.startedAt ?? snapshot.updatedAt;
  const ended = snapshot.completedAt ?? new Date().toISOString();
  const diffMs = Math.max(0, new Date(ended).getTime() - new Date(started).getTime());
  const elapsedMinutes = Math.max(1, diffMs / 60000);

  const completed = snapshot.steps.filter((step) => step.status === 'succeeded').length;
  return toPercent(completed, snapshot.steps.length) / elapsedMinutes;
};

export const progressRun = (snapshot: DrillRunSnapshot): number => {
  return Math.round((snapshot.steps.filter((step) => step.status === 'succeeded').length / Math.max(1, snapshot.steps.length)) * 100);
};

export const normalizeRisk = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export const makeAnalysis = (snapshot: DrillRunSnapshot): SurfaceAnalysis => {
  const analysis = computeSnapshotAnalysis(snapshot);
  const metrics: SurfaceMetric[] = [
    toMetric('health', analysis.summary.healthScore, 0.35),
    toMetric('risk', normalizeRisk(analysis.summary.riskScore), 0.35),
    toMetric('dominant-trace', ratioToInt(Math.max(0, analysis.frameCount * 20)), 0.3),
  ];

  return {
    runId: snapshot.id,
    score: scoreRun(snapshot),
    risk: riskRun(snapshot),
    progress: progressRun(snapshot),
    velocity: Math.round(velocityRun(snapshot)),
    metrics,
    blockers: computeBlockers(snapshot),
  };
};
