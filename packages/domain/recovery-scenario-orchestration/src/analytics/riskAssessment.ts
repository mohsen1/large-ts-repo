import { clamp, movingAverage, toPercent } from '@shared/util';
import type { ConstraintSnapshot, RecoveryPlan } from '../types';

export interface RiskSample {
  readonly timestamp: string;
  readonly metric: string;
  readonly raw: number;
}

export interface ScenarioRiskBand {
  readonly at: string;
  readonly risk: number;
  readonly confidence: number;
  readonly blocked: number;
}

export interface RiskSummary {
  readonly score: number;
  readonly trend: 'declining' | 'stable' | 'rising';
  readonly blockedCount: number;
  readonly unknownCount: number;
  readonly metCount: number;
  readonly horizon: readonly ScenarioRiskBand[];
}

const asScore = (value: number): number => clamp(Math.round(value * 10_000) / 100, 0, 100);

const buildSamples = (snapshots: readonly ConstraintSnapshot[]): readonly number[] =>
  snapshots.map((snapshot) =>
    snapshot.state === 'violated'
      ? 0
      : snapshot.state === 'unknown'
        ? 0.45
        : snapshot.score,
  );

const riskFromSignal = (sample: RiskSample): number => {
  if (sample.metric === 'latency_p99') {
    return clamp(100 - sample.raw, 0, 100);
  }
  if (sample.metric === 'error_rate') {
    return clamp(100 - sample.raw * 100, 0, 100);
  }
  return clamp(sample.raw, 0, 100);
};

export const measureConstraintRisk = (snapshot: ConstraintSnapshot, plan: RecoveryPlan): ScenarioRiskBand => {
  const blocked = snapshot.state === 'violated' ? 1 : 0;
  const base = snapshot.score * 100;
  const confidence = Math.max(20, plan.confidence * 100);
  const risk = asScore(clamp((base + plan.confidence * 100) / (1 + blocked), 0, 100));
  return {
    at: snapshot.evaluatedAt,
    risk,
    confidence,
    blocked,
  };
};

export const summarizeConstraintRisk = (
  snapshots: readonly ConstraintSnapshot[],
  plan: RecoveryPlan,
): RiskSummary => {
  if (snapshots.length === 0) {
    return {
      score: 0,
      trend: 'stable',
      blockedCount: 0,
      unknownCount: 0,
      metCount: 0,
      horizon: [],
    };
  }

  const bands = snapshots.map((snapshot) => measureConstraintRisk(snapshot, plan));
  const horizonValues = movingAverage(
    bands.map((band) => band.risk),
    3,
  );
  const blockedCount = bands.reduce((acc, band) => acc + band.blocked, 0);
  const unknownCount = snapshots.filter((snapshot) => snapshot.state === 'unknown').length;
  const metCount = snapshots.filter((snapshot) => snapshot.state === 'met').length;

  const scoreSamples = buildSamples(snapshots);
  const smoothed = movingAverage(scoreSamples, 3);
  const latest = smoothed[smoothed.length - 1] ?? 0;
  const previous = smoothed.length > 4 ? smoothed[Math.max(0, smoothed.length - 4)] : latest;
  const trend = latest > previous + 0.05 ? 'rising' : latest < previous - 0.05 ? 'declining' : 'stable';
  const score = asScore(toPercent(1 - latest, 1));

  const profile = horizons(bands, plan.confidence);
  return {
    score,
    trend,
    blockedCount,
    unknownCount,
    metCount,
    horizon: profile,
  };
};

const horizons = (bands: readonly ScenarioRiskBand[], confidence: number): readonly ScenarioRiskBand[] => {
  const total = bands.length;
  const window = Math.max(1, Math.floor(total / 4));

  let cursor = 0;
  const entries: ScenarioRiskBand[] = [];
  while (cursor < total) {
    const chunk = bands.slice(cursor, cursor + window);
    const sumRisk = chunk.reduce((acc, entry) => acc + entry.risk, 0);
    const sumConfidence = chunk.reduce((acc, entry) => acc + entry.confidence, 0);
    const at = chunk.length > 0 ? chunk[chunk.length - 1]?.at ?? '' : '';
    const blocked = chunk.reduce((acc, entry) => acc + entry.blocked, 0);
    const risk = chunk.length === 0 ? 0 : asScore(sumRisk / chunk.length);
    const confidence = chunk.length === 0 ? 0 : asScore(sumConfidence / chunk.length);
    entries.push({
      at,
      risk: clamp(risk * confidence / 100, 0, 100),
      confidence: asScore((risk + confidence) / 2),
      blocked,
    });
    cursor += window;
  }

  return entries;
};

export const aggregateSignalRisk = (samples: readonly RiskSample[], confidence: number): readonly ScenarioRiskBand[] => {
  return samples.map((sample) => ({
    at: sample.timestamp,
    confidence,
    risk: asScore(riskFromSignal(sample)),
    blocked: riskFromSignal(sample) < 40 ? 1 : 0,
  }));
};
