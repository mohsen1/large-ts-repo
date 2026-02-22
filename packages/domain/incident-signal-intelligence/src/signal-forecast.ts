import { makeSignalId, estimateImpactScore, normalizeSignalRisk } from './signal-core';
import { parseSignalPlanCandidate } from './signal-schemas';
import type {
  SignalEnvelope,
  SignalWindow,
  SignalWindowStats,
  SignalScoreModel,
  SignalRiskProfile,
  SignalPlanCandidate,
  RiskBand,
  TenantId,
} from './signal-core';

export interface ForecastPoint {
  readonly bucket: string;
  readonly count: number;
  readonly score: number;
  readonly riskBand: RiskBand;
}

export interface ForecastRun {
  readonly modelId: string;
  readonly tenantId: TenantId;
  readonly createdAt: string;
  readonly points: readonly ForecastPoint[];
  readonly summaryScore: number;
}

export const buildWindowStats = (window: SignalWindow): SignalWindowStats => {
  if (window.samples.length === 0) {
    return {
      count: 0,
      meanMagnitude: 0,
      meanVariance: 0,
      maxMagnitude: 0,
      minMagnitude: 0,
      volatility: 0,
    };
  }

  const ordered = [...window.samples].sort((left, right) => left.magnitude - right.magnitude);
  const sumMagnitude = ordered.reduce((acc, sample) => acc + sample.magnitude, 0);
  const sumVariance = ordered.reduce((acc, sample) => acc + sample.variance, 0);

  const meanMagnitude = sumMagnitude / ordered.length;
  const meanVariance = sumVariance / ordered.length;
  const maxMagnitude = ordered.at(-1)?.magnitude ?? 0;
  const minMagnitude = ordered[0]?.magnitude ?? 0;

  const volatility = ordered.length < 2
    ? 0
    : Math.sqrt(ordered.reduce((acc, sample, index) => {
      if (index === 0) {
        return 0;
      }
      const delta = sample.magnitude - ordered[index - 1].magnitude;
      return acc + delta * delta;
    }, 0) / (ordered.length - 1));

  return {
    count: ordered.length,
    meanMagnitude,
    meanVariance,
    maxMagnitude,
    minMagnitude,
    volatility,
  };
};

export const scoreSignalTrajectory = (
  signal: SignalEnvelope,
  model: SignalScoreModel,
  windows: readonly SignalWindow[],
): SignalRiskProfile => {
  const trend = windows
    .map((window, index) => {
      const stats = buildWindowStats(window);
      const score = Math.max(0, estimateImpactScore(signal.vector, model) * (1 + Math.min(index, 3) * 0.05) * (1 + stats.volatility));
      return {
        bucket: `${window.from}/${window.to}`,
        score,
      };
    })
    .reduce((acc, item) => acc + item.score, 0);

  const confidence = windows.length === 0 ? 0.2 : Math.min(1, 0.25 + windows.length * 0.08);
  return {
    signalId: signal.id,
    riskBand: normalizeSignalRisk(trend),
    confidence,
    impactScore: Number(Math.min(1, trend).toFixed(4)),
    mitigationLeadMinutes: Math.max(5, Math.round(trend * 240)),
  };
};

export const buildForecast = (
  tenantId: TenantId,
  signals: readonly SignalEnvelope[],
  model: SignalScoreModel,
): ForecastRun => {
  const buckets = new Map<string, ForecastPoint>();
  for (const signal of signals) {
    const bucket = `${signal.recordedAt.slice(0, 13)}:00Z`;
    const score = estimateImpactScore(signal.vector, model);
    const existing = buckets.get(bucket);
    if (existing) {
      const nextCount = existing.count + 1;
      buckets.set(bucket, {
        ...existing,
        count: nextCount,
        score: Number(((existing.score * existing.count + score) / nextCount).toFixed(4)),
        riskBand: normalizeSignalRisk(score),
      });
      continue;
    }
    buckets.set(bucket, {
      bucket,
      count: 1,
      score,
      riskBand: normalizeSignalRisk(score),
    });
  }

  const points = [...buckets.values()];
  const summaryScore = points.length === 0
    ? 0
    : Number((points.reduce((acc, point) => acc + point.score, 0) / points.length).toFixed(4));

  return {
    modelId: `${tenantId}-forecast-${signals.length}-${points.length}`,
    tenantId,
    createdAt: new Date().toISOString(),
    points,
    summaryScore,
  };
};

export const proposeSignalPlan = (
  signalId: string,
  tenantId: TenantId,
  title: string,
  score: number,
  actions: SignalPlanCandidate['actions'],
): SignalPlanCandidate => parseSignalPlanCandidate({
  id: makeSignalId(`plan-${signalId}`),
  signalId,
  tenantId,
  title,
  rationale: `Synthetic plan for score ${score}`,
  actions,
  expectedDowntimeMinutes: Math.max(1, Math.round(score * 120)),
  approved: false,
});

export const topRiskSignals = (profiles: readonly SignalRiskProfile[], topN = 5): readonly SignalRiskProfile[] =>
  [...profiles].sort((left, right) => right.impactScore - left.impactScore).slice(0, topN);
