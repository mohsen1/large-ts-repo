import type {
  ContinuityReadinessCoverage,
  ContinuityReadinessProjection,
  ContinuityReadinessRun,
  ContinuityReadinessSurfaceId,
} from './types';

export interface ContinuityScenarioPoint {
  readonly step: number;
  readonly score: number;
  readonly note: string;
}

export interface ContinuitySimulationResult {
  readonly runId: string;
  readonly surfaceId: ContinuityReadinessSurfaceId;
  readonly scenario: readonly ContinuityScenarioPoint[];
  readonly projection: ContinuityReadinessProjection;
  readonly coverages: readonly ContinuityCoverageSnapshot[];
}

export interface ContinuityCoverageSnapshot {
  readonly minute: number;
  readonly score: number;
  readonly riskBand: ContinuityReadinessCoverage['riskBand'];
}

const interpolate = (from: number, to: number, steps: number): number[] => {
  if (steps <= 1) {
    return [to];
  }

  const delta = (to - from) / (steps - 1);
  return Array.from({ length: steps }, (_, index) => Number((from + delta * index).toFixed(2)));
};

const riskFromScore = (score: number): ContinuityCoverageSnapshot['riskBand'] => {
  if (score < 40) return 'low';
  if (score < 60) return 'medium';
  if (score < 80) return 'high';
  return 'critical';
};

export const simulateRun = (run: ContinuityReadinessRun, coverage: readonly ContinuityCoverageSnapshot[]): ContinuitySimulationResult => {
  const base = Math.max(0, run.currentScore);
  const points = interpolate(base, base - coverage.length * 0.2, Math.max(1, coverage.length));
  const scenarios: ContinuityScenarioPoint[] = points.map((score, index) => ({
    step: index + 1,
    score,
    note: index === 0 ? `start ${run.phase}` : `checkpoint-${index + 1}`,
  }));
  const finalPoint = points.at(-1);
  const trend: ContinuityReadinessProjection['trend'] = finalPoint === undefined || base <= finalPoint ? 'degrading' : 'improving';

  const projection: ContinuityReadinessProjection = {
    horizonMinutes: Math.min(720, Math.max(60, coverage.length * 60)),
    trend,
    confidence: Number(Math.max(0, Math.min(1, 1 - coverage.length / 120)).toFixed(4)),
    meanScore: Number((scenarios.reduce((sum, point) => sum + point.score, 0) / scenarios.length).toFixed(2)),
    volatility: Number(points.reduce((sum, value, index) => {
      if (index === 0) return 0;
      return sum + Math.abs(value - points[index - 1]);
    }, 0) / Math.max(1, points.length - 1)),
    points: scenarios.map((point) => point.score),
  };

  return {
    runId: String(run.id),
    surfaceId: run.surfaceId,
    scenario: scenarios,
    projection,
    coverages: coverage,
  };
};

export const buildSimulationCoverage = (base: ContinuityReadinessCoverage): ContinuityCoverageSnapshot[] => {
  const length = Math.max(3, Math.round(base.score / 5));
  const values = interpolate(base.score, Math.max(0, base.score - 12), length);
  return values.map((value, index) => ({
    minute: index,
    score: Number(value.toFixed(2)),
    riskBand: riskFromScore(value),
  }));
};

export const summarizeSimulation = (result: ContinuitySimulationResult): string => {
  const best = result.scenario.reduce(
    (acc, point) => ({
      index: point.score > acc.score ? point.step : acc.index,
      score: Math.max(acc.score, point.score),
    }),
    { index: 0, score: Number.NEGATIVE_INFINITY },
  );
  return `simulated ${result.scenario.length} steps, best score ${best.score.toFixed(2)} at step ${best.index}`;
};
