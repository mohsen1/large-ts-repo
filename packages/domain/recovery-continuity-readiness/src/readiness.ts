import { withBrand } from '@shared/core';
import { mapResult, ok, fail, type Result } from '@shared/result';
import type {
  ContinuityReadinessCandidatePlan,
  ContinuityReadinessSignal,
  ContinuityReadinessCoverage,
  ContinuityRiskBand,
  ContinuityReadinessTrend,
  ContinuityObjective,
  ContinuityReadinessWindow,
  ContinuityReadinessProjection,
} from './types';

const weightOfTrend: Record<ContinuityReadinessTrend, number> = {
  improving: -8,
  flat: 0,
  volatile: 16,
  degrading: 24,
};

const bandCutoffs = [
  { min: 0, max: 40, band: 'low' as ContinuityRiskBand },
  { min: 40, max: 70, band: 'medium' as ContinuityRiskBand },
  { min: 70, max: 85, band: 'high' as ContinuityRiskBand },
  { min: 85, max: 120, band: 'critical' as ContinuityRiskBand },
];

const scoreBySignals = (signals: readonly ContinuityReadinessSignal[]): number => {
  if (signals.length === 0) {
    return 55;
  }

  const severitySum = signals.reduce((total, signal) => total + signal.severity * signal.confidence, 0);
  const impactSum = signals.reduce((total, signal) => total + signal.impact, 0);
  const weight = severitySum + impactSum * 0.4;
  const adjusted = Math.round(Math.max(0, Math.min(100, weight / Math.max(1, signals.length))));
  return adjusted;
};

const inferTrend = (points: readonly number[]): ContinuityReadinessTrend => {
  if (points.length < 2) {
    return 'flat';
  }
  const head = points[0];
  const tail = points.at(-1) ?? head;
  const delta = tail - head;
  if (delta <= -8) return 'improving';
  if (delta >= 8) return 'degrading';
  if (Math.abs(delta) > 2.5) return 'volatile';
  return 'flat';
};

const toBand = (score: number): ContinuityRiskBand => {
  const match = bandCutoffs.find((entry) => score >= entry.min && score < entry.max);
  return match ? match.band : 'critical';
};

export const evaluateCoverage = (
  objectives: readonly ContinuityObjective[],
  planSignals: readonly ContinuityReadinessSignal[],
): ContinuityReadinessCoverage[] => {
  const base = scoreBySignals(planSignals);
  return objectives.map((objective) => {
    const weight = objective.criticality === 'critical' ? 1.5 : objective.criticality === 'high' ? 1.2 : 1.0;
    const score = Math.round(base * weight);
    return {
      tenantId: objective.tenantId,
      objectiveId: withBrand(objective.id, 'ContinuityObjectiveId'),
      objectiveName: objective.slaName,
      score: Math.max(0, Math.min(100, score)),
      weight,
      riskBand: toBand(score),
    };
  });
};

export const rankPlans = (
  plans: readonly ContinuityReadinessCandidatePlan[],
): readonly ContinuityReadinessCandidatePlan[] => {
  return [...plans].sort((left, right) => {
    const riskOrder = ['low', 'medium', 'high', 'critical'] as const;
    const leftRisk = riskOrder.indexOf(left.risk);
    const rightRisk = riskOrder.indexOf(right.risk);
    const riskWeight = leftRisk - rightRisk;
    if (riskWeight !== 0) {
      return riskWeight;
    }

    return right.score - left.score;
  });
};

export const choosePlan = (
  plans: readonly ContinuityReadinessCandidatePlan[],
  limit: number,
): Result<ContinuityReadinessCandidatePlan | null, Error> => {
  const ranked = rankPlans(plans);
  if (ranked.length === 0) {
    return ok(null);
  }

  if (limit <= 0) {
    return fail(new Error('invalid limit'));
  }

  const pick = ranked[0];
  return ok(pick);
};

export const buildCoverageTrend = (values: readonly number[], window: ContinuityReadinessWindow): ContinuityReadinessProjection => {
  if (values.length === 0) {
    return {
      horizonMinutes: window.minutes,
      trend: 'flat',
      confidence: 0,
      meanScore: 50,
      volatility: 0,
      points: [],
    };
  }

  const smoothed: number[] = [];
  const bucket = Math.max(1, Math.floor(values.length / Math.min(12, Math.max(2, values.length))));
  let index = 0;

  while (index < values.length) {
    const slice = values.slice(index, index + bucket);
    const avg = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    smoothed.push(Number(avg.toFixed(2)));
    index += bucket;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const confidence = 1 - Math.min(1, Math.sqrt(variance) / 100);

  return {
    horizonMinutes: window.minutes,
    trend: inferTrend(smoothed),
    confidence: Number(confidence.toFixed(4)),
    meanScore: Number(mean.toFixed(2)),
    volatility: Number(Math.sqrt(variance).toFixed(2)),
    points: smoothed,
  };
};

export const describePlanTrend = (plan: ContinuityReadinessCandidatePlan): string => {
  const risk = plan.risk === 'critical' ? 'critical risk' : `${plan.risk} risk`;
  if (plan.score >= 85) {
    return `${plan.label}: aggressive recovery with ${risk}`;
  }
  if (plan.score >= 65) {
    return `${plan.label}: controlled rollout with ${risk}`;
  }
  return `${plan.label}: advisory-only path due to ${risk}`;
};

export const normalizeRiskBand = (value: number): ContinuityRiskBand => toBand(value);
export const enrichSignalSignals = (signals: readonly ContinuityReadinessSignal[]): ContinuityReadinessSignal[] =>
  signals.map((signal, index) => ({
    ...signal,
    tags: [...signal.tags, `seq-${index + 1}`],
  }));

export const planCoverageScore = (plan: ContinuityReadinessCandidatePlan): number =>
  mapResult(choosePlan([plan], 1), () => plan.score).ok ? plan.score : 0;
