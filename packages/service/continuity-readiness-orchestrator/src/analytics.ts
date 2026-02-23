import { ok, fail, type Result } from '@shared/result';
import type { ContinuityReadinessEnvelope, ContinuityReadinessCoverage } from '@domain/recovery-continuity-readiness';

export interface ReadinessReading {
  readonly meanScore: number;
  readonly coverageCount: number;
  readonly activeSignals: number;
  readonly averageRisk: number;
  readonly trend: string;
  readonly labels: readonly string[];
}

const parseRisk = (coverage: readonly ContinuityReadinessCoverage[]): number => {
  if (coverage.length === 0) {
    return 50;
  }
  const score = coverage.reduce((acc, item) => acc + item.score, 0) / coverage.length;
  const maxRiskPenalty = coverage.filter((item) => item.riskBand === 'critical' || item.riskBand === 'high').length;
  return Number((score - maxRiskPenalty * 1.5).toFixed(2));
};

export const summarizeReadinessReadings = (envelope: ContinuityReadinessEnvelope): Result<ReadinessReading, Error> => {
  const { coverage, surface, run, projection } = envelope;
  if (!run || !surface) {
    return fail(new Error('run/surface missing'));
  }

  return ok({
    meanScore: run.currentScore,
    coverageCount: coverage.length,
    activeSignals: surface.signals.length,
    averageRisk: parseRisk(coverage),
    trend: projection.trend,
    labels: [
      `coverage=${coverage.length}`,
      `plans=${surface.plans.length}`,
      `signals=${surface.signals.length}`,
      `projection-volatility=${projection.volatility}`,
    ],
  });
};

export const confidenceByTrend = (projection: ContinuityReadinessEnvelope['projection']): number => projection.confidence;

export const readoutSignals = (coverage: readonly ContinuityReadinessCoverage[]): readonly string[] =>
  coverage.map((entry) => `${entry.objectiveName}: ${entry.score}`);

export const riskHeat = (coverage: readonly ContinuityReadinessCoverage[]): number => {
  if (coverage.length === 0) {
    return 0;
  }
  const weighted = coverage.reduce((acc, item) => {
    const factor = item.riskBand === 'critical' ? 4 : item.riskBand === 'high' ? 3 : item.riskBand === 'medium' ? 2 : 1;
    return acc + item.score * factor;
  }, 0);
  const denom = coverage.reduce((acc, item) => {
    const factor = item.riskBand === 'critical' ? 4 : item.riskBand === 'high' ? 3 : item.riskBand === 'medium' ? 2 : 1;
    return acc + factor;
  }, 0);

  return denom === 0 ? 0 : Number((weighted / denom).toFixed(2));
};
